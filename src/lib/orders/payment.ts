import { db } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import { notify, notifyCustomer } from "@/lib/notify";
import { getGateway } from "@/lib/payments";
import type { GatewayPayment } from "@/lib/payments/gateway";
import { rejectOrder } from "./decisions";
import { heldQuantities, lockVariants } from "./inventory";

// Browser callback after Razorpay Checkout succeeds (PRD §8.1 steps 7–8).
// The signature proves the payment belongs to our order; the payment itself is then fetched from Razorpay.
export async function confirmPaymentFromClient(input: { razorpayOrderId: string; paymentId: string; signature: string }) {
  const gateway = getGateway();
  if (!gateway.verifyPaymentSignature({ orderId: input.razorpayOrderId, paymentId: input.paymentId, signature: input.signature })) {
    throw new DomainError("BAD_SIGNATURE", "Payment could not be verified.");
  }
  const payment = await gateway.fetchPayment(input.paymentId);
  if (payment.orderId !== input.razorpayOrderId) {
    throw new DomainError("BAD_SIGNATURE", "Payment could not be verified.");
  }
  return recordPayment(payment);
}

// Records a payment and, once it is captured, moves the checkout's orders into the approval queue.
// Safe to call any number of times for the same payment (browser callback and webhooks both call it).
export async function recordPayment(payment: GatewayPayment) {
  const checkout = await db.checkout.findUnique({ where: { razorpayOrderId: payment.orderId } });
  if (!checkout) throw new DomainError("UNKNOWN_ORDER", `No checkout for Razorpay order ${payment.orderId}`);

  const status =
    payment.status === "captured" || payment.status === "refunded"
      ? "CAPTURED"
      : payment.status === "failed"
        ? "FAILED"
        : payment.status === "authorized"
          ? "AUTHORIZED"
          : "CREATED";

  const result = await db.$transaction(async (tx) => {
    // Serialises concurrent callbacks for the same checkout.
    await tx.$queryRaw`SELECT id FROM "Checkout" WHERE id = ${checkout.id} FOR UPDATE`;
    const current = await tx.checkout.findUniqueOrThrow({
      where: { id: checkout.id },
      include: { reservations: true, orders: { include: { items: true } } },
    });

    await tx.payment.upsert({
      where: { razorpayPaymentId: payment.id },
      create: {
        checkoutId: checkout.id,
        razorpayOrderId: payment.orderId,
        razorpayPaymentId: payment.id,
        method: payment.method,
        amountPaise: payment.amountPaise,
        feePaise: payment.feePaise,
        taxPaise: payment.taxPaise,
        status,
        capturedAt: status === "CAPTURED" ? new Date() : null,
      },
      update: {
        method: payment.method ?? undefined,
        feePaise: payment.feePaise ?? undefined,
        taxPaise: payment.taxPaise ?? undefined,
        // Never downgrade a captured payment because an older event arrived late.
        ...(status === "CAPTURED" ? { status, capturedAt: new Date() } : {}),
      },
    });

    if (status !== "CAPTURED" || current.status === "PAID") {
      return { justPaid: false, lostOrderIds: [] as string[], amountMismatch: false, checkout: current };
    }

    // The reservation may have lapsed if the customer took longer than 15 minutes.
    // Re-claim each item if it is still free; orders whose items are gone are rejected and refunded below.
    const variantIds = current.reservations.map((r) => r.variantId);
    await lockVariants(tx, variantIds);
    const heldByOthers = await heldQuantities(tx, variantIds, current.id);
    const variants = await tx.productVariant.findMany({ where: { id: { in: variantIds } } });
    const lostVariantIds = new Set<string>();
    for (const r of current.reservations) {
      const v = variants.find((x) => x.id === r.variantId)!;
      if (v.stockQty - (heldByOthers.get(v.id) ?? 0) < r.quantity) lostVariantIds.add(v.id);
    }

    // Paid reservations are held until the admin decides (BR5).
    await tx.reservation.updateMany({
      where: { checkoutId: current.id, variantId: { notIn: [...lostVariantIds] } },
      data: { status: "HELD", expiresAt: null },
    });
    await tx.reservation.updateMany({
      where: { checkoutId: current.id, variantId: { in: [...lostVariantIds] } },
      data: { status: "RELEASED" },
    });
    await tx.checkout.update({ where: { id: current.id }, data: { status: "PAID" } });

    const now = new Date();
    for (const order of current.orders) {
      await tx.order.update({
        where: { id: order.id },
        data: {
          status: "AWAITING_APPROVAL",
          paidAt: now,
          events: { create: { status: "AWAITING_APPROVAL", message: "Payment received. Waiting for the store to confirm." } },
        },
      });
    }
    const lostOrderIds = current.orders
      .filter((o) => o.items.some((i) => lostVariantIds.has(i.variantId)))
      .map((o) => o.id);

    return {
      justPaid: true,
      lostOrderIds,
      amountMismatch: payment.amountPaise !== current.totalPaise,
      checkout: current,
    };
  });

  if (result.justPaid) {
    const orders = await db.order.findMany({ where: { checkoutId: checkout.id }, include: { customer: true } });
    for (const order of orders) {
      if (!result.lostOrderIds.includes(order.id)) {
        await notifyCustomer(order, "order_placed", { totalPaise: order.totalPaise });
      }
    }
    for (const orderId of result.lostOrderIds) {
      await rejectOrder({ orderId, reason: "NOT_AVAILABLE_AT_PAYMENT", actor: { kind: "system" } });
    }
    if (result.amountMismatch) {
      const admins = await db.adminUser.findMany({ where: { role: "SUPER_ADMIN", active: true } });
      for (const a of admins) {
        await notify({
          channel: "admin",
          to: a.email,
          template: "admin_payment_mismatch",
          payload: { razorpayOrderId: payment.orderId, paidPaise: payment.amountPaise, expectedPaise: checkout.totalPaise },
        });
      }
    }
  }

  return { checkoutId: checkout.id, accessToken: checkout.accessToken, paid: status === "CAPTURED" };
}
