import { errorResponse, clientIp } from "@/lib/http";
import { createCheckout } from "@/lib/orders/checkout";
import { checkoutSchema } from "@/lib/orders/checkout-schema";
import { rateLimit } from "@/lib/rate-limit";

// Step 1 of payment: reserve the items and create the Razorpay order (PRD §8.1).
export async function POST(req: Request) {
  if (!rateLimit(`checkout:${clientIp(req)}`, 10, 60_000)) {
    return Response.json({ error: "Too many attempts. Please wait a minute." }, { status: 429 });
  }
  try {
    const input = checkoutSchema.parse(await req.json());
    const checkout = await createCheckout(input);
    return Response.json(checkout);
  } catch (err) {
    return errorResponse(err);
  }
}
