import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { deliverPending } from "@/lib/notifications/deliver";
import { emailHtml, renderMessage } from "@/lib/notifications/messages";
import { NotConfigured, phoneChannel, setSenders, type OutboundMessage, type Sender } from "@/lib/notifications/providers";
import { notify, type Template } from "@/lib/notify";
import { createCheckout } from "@/lib/orders/checkout";
import { reconcilePayments } from "@/lib/orders/reconcile";
import { getGateway } from "@/lib/payments";
import type { MockGateway } from "@/lib/payments/mock";
import { photoUrl } from "@/lib/photo-url";
import { cloudinarySignature, photoUploadTicket } from "@/lib/uploads";
import { checkoutInput, makeAdmin, makeBranch, makeProduct, resetDb } from "./helpers";

const templates: Template[] = [
  "order_placed",
  "order_approved",
  "order_rejected",
  "order_cancelled",
  "order_shipped",
  "order_ready_for_pickup",
  "order_delivered",
  "admin_approval_overdue",
  "admin_refund_failed",
  "admin_payment_mismatch",
];

describe("message wording", () => {
  it("renders every template with its order number", () => {
    for (const t of templates) {
      const m = renderMessage(t, { orderNumber: "TS-IND-1", razorpayOrderId: "order_1", totalPaise: 449_900 });
      expect(m.subject.length).toBeGreaterThan(5);
      expect(m.vars.length).toBeGreaterThan(0);
      expect(m.subject + m.text).toMatch(/TS-IND-1|order_1/);
    }
    expect(renderMessage("order_placed", { orderNumber: "X", totalPaise: 449_900 }).vars).toEqual(["X", "₹4,499"]);
  });

  it("escapes customer-controlled text in email HTML", () => {
    const html = emailHtml(renderMessage("order_rejected", { orderNumber: "X", reason: "<script>alert(1)</script>" }));
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});

describe("photo uploads", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("signs like Cloudinary's documented example", () => {
    const params = { eager: "w_400,h_300,c_pad|w_260,h_200,c_crop", public_id: "sample_image", timestamp: "1315060510" };
    expect(cloudinarySignature(params, "abcd")).toBe("bfd09f95f331f558cbd1320e67aa8d488770583e");
  });

  it("issues no ticket until Cloudinary is configured", () => {
    vi.stubEnv("CLOUDINARY_CLOUD_NAME", "");
    expect(photoUploadTicket()).toBeNull();
    vi.stubEnv("CLOUDINARY_CLOUD_NAME", "demo");
    vi.stubEnv("CLOUDINARY_API_KEY", "key");
    vi.stubEnv("CLOUDINARY_API_SECRET", "secret");
    const t = photoUploadTicket(new Date(1_700_000_000_000))!;
    expect(t.url).toBe("https://api.cloudinary.com/v1_1/demo/image/upload");
    expect(t.fields).toMatchObject({ api_key: "key", folder: "thriftsyndicate/products", timestamp: "1700000000" });
    expect(t.fields).not.toHaveProperty("api_secret");
  });

  it("resizes Cloudinary photos only", () => {
    expect(photoUrl("https://res.cloudinary.com/demo/image/upload/v1/a.jpg", 640)).toBe("https://res.cloudinary.com/demo/image/upload/f_auto,q_auto,c_limit,w_640/v1/a.jpg");
    expect(photoUrl("https://example.com/a.jpg", 640)).toBe("https://example.com/a.jpg");
  });
});

describe("message delivery", () => {
  const sent: OutboundMessage[] = [];
  const ok: Sender = { send: async (m) => (sent.push(m), { providerId: `id-${sent.length}` }) };

  beforeEach(async () => {
    await resetDb();
    sent.length = 0;
  });
  afterEach(() => {
    setSenders(undefined);
    vi.unstubAllEnvs();
  });

  it("sends recorded messages once and marks them sent", async () => {
    setSenders({ email: ok, sms: ok });
    await notify({ channel: "email", to: "a@example.com", template: "order_approved", payload: { orderNumber: "TS-1" } });
    await notify({ channel: "sms", to: "9876543210", template: "order_approved", payload: { orderNumber: "TS-1" } });

    expect(await deliverPending()).toEqual({ sent: 2, failed: 0, skipped: 0 });
    expect(await deliverPending()).toEqual({ sent: 0, failed: 0, skipped: 0 });
    expect(sent.map((m) => m.to)).toEqual(["a@example.com", "9876543210"]);
    const rows = await db.notification.findMany();
    expect(rows.every((r) => r.status === "SENT" && r.sentAt && r.providerId)).toBe(true);
  });

  it("never double-sends when two runs overlap", async () => {
    setSenders({ email: ok });
    for (let i = 0; i < 5; i++) await notify({ channel: "email", to: `c${i}@example.com`, template: "order_approved", payload: { orderNumber: `TS-${i}` } });
    await Promise.all([deliverPending(), deliverPending(), deliverPending()]);
    expect(sent).toHaveLength(5);
  });

  it("retries failures on later runs and skips channels that aren't set up", async () => {
    let fail = true;
    setSenders({
      email: { send: async (m) => (fail ? Promise.reject(new Error("provider down")) : ok.send(m)) },
      sms: { send: async () => Promise.reject(new NotConfigured("no SMS provider")) },
    });
    await notify({ channel: "email", to: "a@example.com", template: "order_placed", payload: { orderNumber: "TS-1" } });
    await notify({ channel: "sms", to: "9876543210", template: "order_placed", payload: { orderNumber: "TS-1" } });

    expect(await deliverPending()).toEqual({ sent: 0, failed: 1, skipped: 1 });
    fail = false;
    expect(await deliverPending()).toEqual({ sent: 1, failed: 0, skipped: 0 });
    const email = await db.notification.findFirstOrThrow({ where: { channel: "email" } });
    expect(email).toMatchObject({ status: "SENT", attempts: 2, error: null });
    expect((await db.notification.findFirstOrThrow({ where: { channel: "sms" } })).status).toBe("SKIPPED");
  });

  it("uses WhatsApp for phone messages once it is configured", () => {
    vi.stubEnv("WHATSAPP_TOKEN", "");
    expect(phoneChannel()).toBe("sms");
    vi.stubEnv("WHATSAPP_TOKEN", "t");
    vi.stubEnv("WHATSAPP_PHONE_NUMBER_ID", "123");
    expect(phoneChannel()).toBe("whatsapp");
  });
});

describe("nightly payment reconciliation", () => {
  beforeEach(resetDb);

  it("records a captured payment whose webhook never arrived", async () => {
    const branch = await makeBranch("IND");
    const product = await makeProduct(branch.id);
    const c = await createCheckout(checkoutInput([product.variants[0].id]));
    (getGateway() as MockGateway).capture(c.razorpayOrderId, c.amountPaise);

    const first = await reconcilePayments();
    expect(first.recovered).toBeGreaterThanOrEqual(1);
    const order = await db.order.findFirstOrThrow({ where: { checkoutId: c.checkoutId } });
    expect(order.status).toBe("AWAITING_APPROVAL");

    const again = await reconcilePayments();
    expect(again.recovered).toBe(0);
  });

  it("alerts the owners about a payment it can't match", async () => {
    await makeAdmin("SUPER_ADMIN", null);
    (getGateway() as MockGateway).capture("order_unknown", 99_900);
    const result = await reconcilePayments();
    expect(result.problems).toBeGreaterThanOrEqual(1);
    // The mock gateway remembers payments from earlier tests too, so look for ours among the alerts.
    const alerts = await db.notification.findMany({ where: { template: "admin_payment_mismatch" } });
    expect(alerts.map((a) => (a.payload as Record<string, unknown>).razorpayOrderId)).toContain("order_unknown");
  });
});
