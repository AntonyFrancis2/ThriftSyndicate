import "server-only";
import { db } from "@/lib/db";

// A guest's view of one checkout: every branch order it paid for. The access token is the credential.
export async function getCheckoutForCustomer(checkoutId: string, token: string | undefined) {
  if (!token) return null;
  const checkout = await db.checkout.findUnique({
    where: { id: checkoutId },
    include: {
      customer: true,
      payments: { where: { status: "CAPTURED" } },
      orders: {
        orderBy: { number: "asc" },
        include: {
          branch: true,
          items: true,
          events: { orderBy: { createdAt: "asc" } },
          refunds: { orderBy: { createdAt: "asc" } },
        },
      },
    },
  });
  if (!checkout || checkout.accessToken.length !== token.length) return null;
  const { timingSafeEqual } = await import("node:crypto");
  if (!timingSafeEqual(Buffer.from(checkout.accessToken), Buffer.from(token))) return null;
  return checkout;
}
