import { z } from "zod";
import { errorResponse } from "@/lib/http";
import { confirmPaymentFromClient } from "@/lib/orders/payment";

const bodySchema = z.object({
  razorpay_order_id: z.string().min(1),
  razorpay_payment_id: z.string().min(1),
  razorpay_signature: z.string().min(1),
});

// Razorpay Checkout's success handler posts here; the signature is verified server-side (PRD §8.2).
export async function POST(req: Request) {
  try {
    const body = bodySchema.parse(await req.json());
    const result = await confirmPaymentFromClient({
      razorpayOrderId: body.razorpay_order_id,
      paymentId: body.razorpay_payment_id,
      signature: body.razorpay_signature,
    });
    return Response.json({ ok: true, checkoutId: result.checkoutId, token: result.accessToken, paid: result.paid });
  } catch (err) {
    return errorResponse(err);
  }
}
