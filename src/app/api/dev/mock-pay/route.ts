import { z } from "zod";
import { db } from "@/lib/db";
import { getGateway, mockAllowed } from "@/lib/payments";
import { MockGateway } from "@/lib/payments/mock";

// Local development only: plays the part of Razorpay Checkout when no keys are configured.
export async function POST(req: Request) {
  if (!mockAllowed()) return Response.json({ error: "not available" }, { status: 404 });
  const gateway = getGateway();
  if (!(gateway instanceof MockGateway)) {
    return Response.json({ error: "not available" }, { status: 404 });
  }
  const { orderId, method } = z.object({ orderId: z.string(), method: z.string().default("upi") }).parse(await req.json());
  const checkout = await db.checkout.findUnique({ where: { razorpayOrderId: orderId } });
  if (!checkout) return Response.json({ error: "unknown order" }, { status: 404 });
  const { payment, signature } = gateway.capture(orderId, checkout.totalPaise, method);
  return Response.json({ razorpay_order_id: orderId, razorpay_payment_id: payment.id, razorpay_signature: signature });
}
