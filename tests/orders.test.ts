import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { createCheckout } from "@/lib/orders/checkout";
import {
  advanceFulfilment,
  approveOrder,
  cancelOrderByCustomer,
  rejectOrder,
  setFoundOnRack,
} from "@/lib/orders/decisions";
import { autoRejectOverdue, escalateSlowApprovals, expireUnpaidCheckouts } from "@/lib/orders/jobs";
import { confirmPaymentFromClient, recordPayment } from "@/lib/orders/payment";
import { handleRazorpayWebhook } from "@/lib/orders/webhooks";
import { getGateway, setGateway } from "@/lib/payments";
import { hmacHex } from "@/lib/payments/gateway";
import { MOCK_SECRET, MockGateway } from "@/lib/payments/mock";
import { checkoutInput, makeAdmin, makeBranch, makeProduct, placePaidOrder, resetDb } from "./helpers";

const mock = () => getGateway() as MockGateway;

beforeEach(async () => {
  setGateway(undefined);
  await resetDb();
});
afterEach(() => setGateway(undefined));

async function ordersOf(checkoutId: string) {
  return db.order.findMany({ where: { checkoutId }, include: { items: true, refunds: true }, orderBy: { number: "asc" } });
}

async function tickAll(orderId: string, actor: Awaited<ReturnType<typeof makeAdmin>>) {
  const items = await db.orderItem.findMany({ where: { orderId } });
  for (const i of items) await setFoundOnRack({ orderItemId: i.id, found: true, actor });
}

describe("checkout", () => {
  it("computes the total on the server and splits a two-branch bag into two orders under one payment (BR6)", async () => {
    const a = await makeBranch("AAA");
    const b = await makeBranch("BBB");
    const p1 = await makeProduct(a.id, { pricePaise: 99_900 });
    const p2 = await makeProduct(b.id, { pricePaise: 250_000 });

    const c = await createCheckout(checkoutInput([p1.variants[0].id, p2.variants[0].id]));
    const orders = await ordersOf(c.checkoutId);

    expect(orders).toHaveLength(2);
    // Branch A ships for ₹99 (under the free-shipping threshold); branch B ships free.
    expect(orders.map((o) => o.totalPaise).sort()).toEqual([109_800, 250_000].sort());
    expect(c.amountPaise).toBe(109_800 + 250_000);
    expect(orders.every((o) => o.status === "PENDING_PAYMENT")).toBe(true);
  });

  it("never sells the same single piece twice (BR5)", async () => {
    const a = await makeBranch("AAA");
    const p = await makeProduct(a.id);
    const v = p.variants[0].id;

    const results = await Promise.allSettled([
      createCheckout(checkoutInput([v])),
      createCheckout(checkoutInput([v], { contact: { name: "Ravi", phone: "9123456789", email: "ravi@example.com" } })),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(rejected.reason.code).toBe("ITEMS_UNAVAILABLE");
  });

  it("frees the item after 15 minutes if unpaid", async () => {
    const a = await makeBranch("AAA");
    const p = await makeProduct(a.id);
    const start = new Date(Date.now() - 16 * 60_000);
    await createCheckout(checkoutInput([p.variants[0].id]), start);

    // Expired hold no longer blocks another shopper.
    await expect(createCheckout(checkoutInput([p.variants[0].id]))).resolves.toBeDefined();
    expect(await expireUnpaidCheckouts()).toBe(1);
  });
});

describe("payment", () => {
  it("moves orders to awaiting approval once the signed payment is verified, and only once", async () => {
    const a = await makeBranch("AAA");
    const p = await makeProduct(a.id);
    const c = await createCheckout(checkoutInput([p.variants[0].id]));
    const { payment, signature } = mock().capture(c.razorpayOrderId, c.amountPaise);

    await confirmPaymentFromClient({ razorpayOrderId: c.razorpayOrderId, paymentId: payment.id, signature });
    await confirmPaymentFromClient({ razorpayOrderId: c.razorpayOrderId, paymentId: payment.id, signature });

    const [order] = await ordersOf(c.checkoutId);
    expect(order.status).toBe("AWAITING_APPROVAL");
    expect(await db.payment.count()).toBe(1);
    expect(await db.notification.count({ where: { template: "order_placed" } })).toBe(2); // one email + one SMS
  });

  it("rejects a forged signature", async () => {
    const a = await makeBranch("AAA");
    const p = await makeProduct(a.id);
    const c = await createCheckout(checkoutInput([p.variants[0].id]));
    const { payment } = mock().capture(c.razorpayOrderId, c.amountPaise);

    await expect(
      confirmPaymentFromClient({ razorpayOrderId: c.razorpayOrderId, paymentId: payment.id, signature: "forged" }),
    ).rejects.toMatchObject({ code: "BAD_SIGNATURE" });
  });

  it("reaches the approval queue through the webhook when the browser closed, ignoring duplicates", async () => {
    const a = await makeBranch("AAA");
    const p = await makeProduct(a.id);
    const c = await createCheckout(checkoutInput([p.variants[0].id]));
    const { payment } = mock().capture(c.razorpayOrderId, c.amountPaise);
    const rawBody = JSON.stringify({
      event: "payment.captured",
      payload: { payment: { entity: { id: payment.id, order_id: c.razorpayOrderId, amount: c.amountPaise, status: "captured", method: "upi" } } },
    });
    const signature = hmacHex(MOCK_SECRET, rawBody);

    expect(await handleRazorpayWebhook({ rawBody, signature, eventId: "evt_1" })).toEqual({ duplicate: false });
    expect(await handleRazorpayWebhook({ rawBody, signature, eventId: "evt_1" })).toEqual({ duplicate: true });
    await expect(handleRazorpayWebhook({ rawBody, signature: "bad", eventId: "evt_2" })).rejects.toMatchObject({ code: "BAD_SIGNATURE" });

    const [order] = await ordersOf(c.checkoutId);
    expect(order.status).toBe("AWAITING_APPROVAL");
  });

  it("refunds a late payment when the item was taken after the hold lapsed", async () => {
    const a = await makeBranch("AAA");
    const p = await makeProduct(a.id);
    const v = p.variants[0].id;
    const slow = await createCheckout(checkoutInput([v]), new Date(Date.now() - 20 * 60_000));
    await placePaidOrder([v]); // someone else buys it

    const { payment } = mock().capture(slow.razorpayOrderId, slow.amountPaise);
    await recordPayment(payment);

    const [order] = await ordersOf(slow.checkoutId);
    expect(order.status).toBe("REJECTED");
    expect(order.rejectionReason).toBe("NOT_AVAILABLE_AT_PAYMENT");
    expect(order.refunds[0].amountPaise).toBe(order.totalPaise);
  });
});

describe("admin decisions", () => {
  it("approve needs every item found on the rack, then takes the piece out of stock", async () => {
    const a = await makeBranch("AAA");
    const admin = await makeAdmin("BRANCH_ADMIN", a.id);
    const p = await makeProduct(a.id);
    const c = await placePaidOrder([p.variants[0].id]);
    const [order] = await ordersOf(c.checkoutId);

    await expect(approveOrder({ orderId: order.id, actor: admin })).rejects.toMatchObject({ code: "ITEMS_NOT_FOUND" });
    await tickAll(order.id, admin);
    await approveOrder({ orderId: order.id, actor: admin });

    const after = await db.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(after.status).toBe("CONFIRMED");
    expect(after.approvedById).toBe(admin.id);
    const product = await db.product.findUniqueOrThrow({ where: { id: p.id }, include: { variants: true } });
    expect(product.status).toBe("SOLD");
    expect(product.variants[0].stockQty).toBe(0);
    expect(await db.auditLog.count({ where: { action: "order.approve", adminId: admin.id } })).toBe(1);
  });

  it("stops branch admins acting on the other branch's orders", async () => {
    const a = await makeBranch("AAA");
    const b = await makeBranch("BBB");
    const adminB = await makeAdmin("BRANCH_ADMIN", b.id);
    const p = await makeProduct(a.id);
    const c = await placePaidOrder([p.variants[0].id]);
    const [order] = await ordersOf(c.checkoutId);

    await expect(rejectOrder({ orderId: order.id, reason: "DAMAGED", actor: adminB })).rejects.toMatchObject({ code: "FORBIDDEN" });
    const superAdmin = await makeAdmin("SUPER_ADMIN", null);
    await expect(rejectOrder({ orderId: order.id, reason: "DAMAGED", actor: superAdmin })).resolves.toBeDefined();
  });

  it("reject refunds in full; 'sold in store' marks the piece sold", async () => {
    const a = await makeBranch("AAA");
    const admin = await makeAdmin("BRANCH_ADMIN", a.id);
    const p = await makeProduct(a.id);
    const c = await placePaidOrder([p.variants[0].id]);
    const [order] = await ordersOf(c.checkoutId);

    await rejectOrder({ orderId: order.id, reason: "SOLD_IN_STORE", actor: admin });

    const [after] = await ordersOf(c.checkoutId);
    expect(after.status).toBe("REJECTED");
    expect(after.refundedPaise).toBe(after.totalPaise);
    expect(after.refunds[0]).toMatchObject({ status: "PROCESSED", createdById: admin.id });
    expect((await db.product.findUniqueOrThrow({ where: { id: p.id } })).status).toBe("SOLD");
  });

  it("reject for fraud releases the piece back to the shop", async () => {
    const a = await makeBranch("AAA");
    const admin = await makeAdmin("BRANCH_ADMIN", a.id);
    const p = await makeProduct(a.id);
    const c = await placePaidOrder([p.variants[0].id]);
    const [order] = await ordersOf(c.checkoutId);

    await rejectOrder({ orderId: order.id, reason: "SUSPECTED_FRAUD", actor: admin });
    await expect(createCheckout(checkoutInput([p.variants[0].id]))).resolves.toBeDefined();
  });

  it("'Other' needs a note", async () => {
    const a = await makeBranch("AAA");
    const admin = await makeAdmin("BRANCH_ADMIN", a.id);
    const p = await makeProduct(a.id);
    const c = await placePaidOrder([p.variants[0].id]);
    const [order] = await ordersOf(c.checkoutId);
    await expect(rejectOrder({ orderId: order.id, reason: "OTHER", actor: admin })).rejects.toMatchObject({ code: "NOTE_REQUIRED" });
  });

  it("keeps the rejection and alerts super admins when the refund call fails", async () => {
    const a = await makeBranch("AAA");
    const admin = await makeAdmin("BRANCH_ADMIN", a.id);
    await makeAdmin("SUPER_ADMIN", null);
    const p = await makeProduct(a.id);
    const c = await placePaidOrder([p.variants[0].id]);
    const [order] = await ordersOf(c.checkoutId);

    const failing = Object.assign(Object.create(mock()), { refund: async () => { throw new Error("Razorpay down"); } });
    setGateway(failing);
    await rejectOrder({ orderId: order.id, reason: "DAMAGED", actor: admin });

    const [after] = await ordersOf(c.checkoutId);
    expect(after.status).toBe("REJECTED");
    expect(after.refunds[0].status).toBe("FAILED");
    expect(await db.notification.count({ where: { template: "admin_refund_failed" } })).toBe(1);
  });
});

describe("customer cancellation (BR8)", () => {
  it("allows cancel with refund while awaiting approval, not after", async () => {
    const a = await makeBranch("AAA");
    const admin = await makeAdmin("BRANCH_ADMIN", a.id);
    const p1 = await makeProduct(a.id);
    const p2 = await makeProduct(a.id);

    const c1 = await placePaidOrder([p1.variants[0].id]);
    const [o1] = await ordersOf(c1.checkoutId);
    await expect(cancelOrderByCustomer({ orderId: o1.id, accessToken: "wrong" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await cancelOrderByCustomer({ orderId: o1.id, accessToken: c1.accessToken });
    const [after1] = await ordersOf(c1.checkoutId);
    expect(after1.status).toBe("CANCELLED");
    expect(after1.refundedPaise).toBe(after1.totalPaise);

    const c2 = await placePaidOrder([p2.variants[0].id]);
    const [o2] = await ordersOf(c2.checkoutId);
    await tickAll(o2.id, admin);
    await approveOrder({ orderId: o2.id, actor: admin });
    await expect(cancelOrderByCustomer({ orderId: o2.id, accessToken: c2.accessToken })).rejects.toMatchObject({ code: "INVALID_STATE" });
  });
});

describe("approval deadline (BR4)", () => {
  it("alerts at 24 hours once and auto-rejects with a full refund at 48 hours", async () => {
    const a = await makeBranch("AAA");
    await makeAdmin("SUPER_ADMIN", null);
    const p = await makeProduct(a.id);
    const c = await placePaidOrder([p.variants[0].id]);
    const [order] = await ordersOf(c.checkoutId);

    const in25h = new Date(Date.now() + 25 * 3_600_000);
    expect(await escalateSlowApprovals(in25h)).toBe(1);
    expect(await escalateSlowApprovals(in25h)).toBe(0);

    expect(await autoRejectOverdue(new Date(Date.now() + 47 * 3_600_000))).toBe(0);
    expect(await autoRejectOverdue(new Date(Date.now() + 49 * 3_600_000))).toBe(1);
    const after = await db.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(after).toMatchObject({ status: "REJECTED", rejectionReason: "AUTO_TIMEOUT", refundedPaise: order.totalPaise });
  });
});

describe("fulfilment", () => {
  it("pickup orders need the customer's code to be collected", async () => {
    const a = await makeBranch("AAA");
    const admin = await makeAdmin("BRANCH_ADMIN", a.id);
    const p = await makeProduct(a.id);
    const c = await createCheckout(checkoutInput([p.variants[0].id], { deliveryType: "PICKUP", address: undefined }));
    const { payment } = mock().capture(c.razorpayOrderId, c.amountPaise);
    await recordPayment(payment);
    const [order] = await ordersOf(c.checkoutId);
    expect(order.shippingPaise).toBe(0);

    await tickAll(order.id, admin);
    await approveOrder({ orderId: order.id, actor: admin });
    await advanceFulfilment({ orderId: order.id, to: "PACKED", actor: admin });
    await expect(advanceFulfilment({ orderId: order.id, to: "SHIPPED", actor: admin, courier: "X", awb: "1" })).rejects.toMatchObject({ code: "INVALID_STATE" });
    const ready = await advanceFulfilment({ orderId: order.id, to: "READY_FOR_PICKUP", actor: admin });
    await expect(advanceFulfilment({ orderId: order.id, to: "COLLECTED", actor: admin, pickupOtp: "000000" })).rejects.toMatchObject({ code: "BAD_OTP" });
    const done = await advanceFulfilment({ orderId: order.id, to: "COLLECTED", actor: admin, pickupOtp: ready.pickupOtp! });
    expect(done.status).toBe("COLLECTED");
  });

  it("shipping needs courier and AWB", async () => {
    const a = await makeBranch("AAA");
    const admin = await makeAdmin("BRANCH_ADMIN", a.id);
    const p = await makeProduct(a.id);
    const c = await placePaidOrder([p.variants[0].id]);
    const [order] = await ordersOf(c.checkoutId);
    await tickAll(order.id, admin);
    await approveOrder({ orderId: order.id, actor: admin });
    await advanceFulfilment({ orderId: order.id, to: "PACKED", actor: admin });
    await expect(advanceFulfilment({ orderId: order.id, to: "SHIPPED", actor: admin })).rejects.toMatchObject({ code: "TRACKING_REQUIRED" });
    const shipped = await advanceFulfilment({ orderId: order.id, to: "SHIPPED", actor: admin, courier: "Delhivery", awb: "123456" });
    expect(shipped.status).toBe("SHIPPED");
  });
});
