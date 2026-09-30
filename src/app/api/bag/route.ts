import { z } from "zod";
import { db } from "@/lib/db";
import { activeReservationWhere } from "@/lib/orders/inventory";

// Fresh prices and availability for what's in the browser bag. Items are not reserved in the bag (PRD §6.6).
export async function POST(req: Request) {
  const parsed = z.object({ variantIds: z.array(z.string()).max(30) }).safeParse(await req.json());
  if (!parsed.success) return Response.json({ error: "invalid" }, { status: 400 });
  const variants = await db.productVariant.findMany({
    where: { id: { in: parsed.data.variantIds } },
    include: {
      product: { include: { images: { orderBy: { position: "asc" }, take: 1 }, branch: { select: { id: true, name: true, pickupEnabled: true } } } },
      reservations: { where: activeReservationWhere() },
    },
  });
  return Response.json({
    items: variants.map((v) => {
      const held = v.reservations.reduce((s, r) => s + r.quantity, 0);
      return {
        variantId: v.id,
        productId: v.productId,
        slug: v.product.slug,
        title: v.product.title,
        size: v.size,
        era: v.product.era,
        pricePaise: v.product.pricePaise,
        imageUrl: v.product.images[0]?.url ?? null,
        branch: v.product.branch,
        available: v.product.status === "PUBLISHED" ? Math.max(0, v.stockQty - held) : 0,
      };
    }),
  });
}
