import { Prisma } from "@/generated/prisma/client";
import type { Tx } from "@/lib/db";

// A reservation counts against stock while it is HELD and either paid (no expiry) or still inside its window (BR5).
export function activeReservationWhere(now = new Date()): Prisma.ReservationWhereInput {
  return { status: "HELD", OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] };
}

// Row-locks the variants so two shoppers can't reserve the last unit at the same time (PRD §12, zero double-sells).
// Locks are taken in id order to avoid deadlocks.
export async function lockVariants(tx: Tx, variantIds: string[]) {
  const ids = [...new Set(variantIds)].sort();
  if (ids.length === 0) return;
  await tx.$queryRaw`SELECT id FROM "ProductVariant" WHERE id IN (${Prisma.join(ids)}) ORDER BY id FOR UPDATE`;
}

// Units currently held by active reservations, per variant. Optionally ignores one checkout's own holds.
export async function heldQuantities(tx: Tx, variantIds: string[], excludeCheckoutId?: string) {
  const rows = await tx.reservation.groupBy({
    by: ["variantId"],
    where: {
      variantId: { in: variantIds },
      ...activeReservationWhere(),
      ...(excludeCheckoutId ? { checkoutId: { not: excludeCheckoutId } } : {}),
    },
    _sum: { quantity: true },
  });
  return new Map(rows.map((r) => [r.variantId, r._sum.quantity ?? 0]));
}

// Takes approved units out of stock; a product whose variants are all at zero becomes SOLD.
export async function consumeStock(tx: Tx, variantId: string, quantity: number) {
  const variant = await tx.productVariant.update({
    where: { id: variantId },
    data: { stockQty: { decrement: quantity } },
  });
  if (variant.stockQty < 0) {
    throw new Error(`Stock for variant ${variantId} went negative`);
  }
  await markSoldIfEmpty(tx, variant.productId);
}

export async function markSoldIfEmpty(tx: Tx, productId: string) {
  const remaining = await tx.productVariant.aggregate({ where: { productId }, _sum: { stockQty: true } });
  if ((remaining._sum.stockQty ?? 0) <= 0) {
    await tx.product.update({ where: { id: productId }, data: { status: "SOLD", soldAt: new Date() } });
  }
}
