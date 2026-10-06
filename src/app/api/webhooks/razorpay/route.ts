import { DomainError } from "@/lib/errors";
import { handleRazorpayWebhook } from "@/lib/orders/webhooks";

// Razorpay webhooks: payment.*, order.paid, refund.* (PRD §8.2).
// 2xx tells Razorpay to stop retrying; a 5xx makes it retry later.
export async function POST(req: Request) {
  const rawBody = await req.text();
  try {
    const result = await handleRazorpayWebhook({
      rawBody,
      signature: req.headers.get("x-razorpay-signature") ?? "",
      eventId: req.headers.get("x-razorpay-event-id"),
    });
    return Response.json({ ok: true, ...result });
  } catch (err) {
    if (err instanceof DomainError && err.code === "BAD_SIGNATURE") {
      return Response.json({ error: "invalid signature" }, { status: 400 });
    }
    if (err instanceof DomainError && err.code === "UNKNOWN_ORDER") {
      // A payment not created by this store (e.g. a payment link); nothing to do.
      return Response.json({ ok: true, ignored: true });
    }
    console.error("webhook failed", err);
    return Response.json({ error: "failed" }, { status: 500 });
  }
}
