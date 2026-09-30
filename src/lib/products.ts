import { z } from "zod";
import { Category, Condition, Era } from "@/generated/prisma/enums";
import { storeConfig } from "@/lib/config";
import { db } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import type { AdminActor } from "@/lib/orders/decisions";
import { assertBranchAccess } from "@/lib/orders/decisions";
import { activeReservationWhere, lockVariants, markSoldIfEmpty } from "@/lib/orders/inventory";

const measurementKeys = ["chest", "length", "shoulder", "waist", "inseam", "rise", "legOpening"] as const;

const optionalText = z
  .string()
  .trim()
  .max(120)
  .transform((v) => v || null)
  .nullable()
  .optional();

export const productFormSchema = z.object({
  branchId: z.string().min(1, "Choose a branch"),
  title: z.string().trim().min(3, "Add a title").max(120),
  description: z.string().trim().max(2000).default(""),
  category: z.enum(Category),
  era: z.enum(Era),
  brand: z.string().trim().min(1, "Add the brand").max(60),
  team: optionalText,
  season: optionalText,
  kitType: optionalText,
  authenticity: optionalText,
  playerPrint: optionalText,
  decade: z.coerce.number().int().min(1950).max(2030).nullable().optional(),
  condition: z.enum(Condition),
  flaws: z.array(z.string().trim().min(1).max(200)).max(20).default([]),
  measurements: z.partialRecord(z.enum(measurementKeys), z.number().positive().max(300)).default({}),
  material: optionalText,
  colour: optionalText,
  pricePaise: z.number().int().positive("Add a price"),
  compareAtPaise: z.number().int().positive().nullable().optional(),
  rackLocation: optionalText,
  tags: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
  images: z.array(z.string().trim().min(1).max(500)).max(storeConfig.maxPhotos, `At most ${storeConfig.maxPhotos} photos`).default([]),
  variants: z
    .array(z.object({ size: z.string().trim().min(1).max(10).toUpperCase(), stockQty: z.number().int().min(0).max(999) }))
    .min(1, "Add at least one size"),
});
export type ProductForm = z.output<typeof productFormSchema>;

// BR9: a product can't go live without at least 4 photos, a condition grade and measurements.
export function publishProblems(p: { images: unknown[]; condition: string | null; measurements: unknown; era: string; category: string; team?: string | null }) {
  const problems: string[] = [];
  if (p.images.length < storeConfig.minPhotos) problems.push(`Add at least ${storeConfig.minPhotos} photos (front, back, tag, detail/flaws).`);
  if (!p.condition) problems.push("Choose a condition grade.");
  const m = (p.measurements ?? {}) as Record<string, number>;
  const needed = p.category === "JEANS" ? ["waist", "inseam"] : ["chest", "length"];
  const missing = needed.filter((k) => !m[k]);
  if (missing.length) problems.push(`Add measurements: ${missing.join(", ")}.`);
  if (p.era === "RETRO" && (p.condition === "NEW" || p.condition === "LIKE_NEW")) problems.push("Retro items use Deadstock, Excellent, Very good or Good.");
  if (p.era === "LATEST" && !(p.condition === "NEW" || p.condition === "LIKE_NEW")) problems.push("Latest-season items are New or Like new.");
  if (p.category === "JERSEY" && !p.team) problems.push("Add the team for a jersey.");
  return problems;
}

// "Stüssy Tee" -> "stussy-tee": strip accents before replacing everything else with dashes.
export function slugify(s: string) {
  return s
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 80);
}

async function uniqueSlug(base: string, excludeId?: string) {
  let slug = slugify(base) || "item";
  for (let n = 2; ; n++) {
    const clash = await db.product.findUnique({ where: { slug } });
    if (!clash || clash.id === excludeId) return slug;
    slug = `${slugify(base)}-${n}`;
  }
}

async function nextSku(branchId: string) {
  const branch = await db.branch.findUniqueOrThrow({ where: { id: branchId } });
  const count = await db.product.count({ where: { branchId } });
  for (let n = count + 1001; ; n++) {
    const sku = `${branch.code}-${n}`;
    if (!(await db.product.findUnique({ where: { sku } }))) return sku;
  }
}

async function audit(actor: AdminActor, action: string, entityId: string, after?: unknown) {
  await db.auditLog.create({ data: { adminId: actor.id, action, entity: "Product", entityId, after: after as object } });
}

export async function saveProduct(input: { id?: string; data: ProductForm; actor: AdminActor }) {
  const { data, actor } = input;
  assertBranchAccess(actor, data.branchId);
  const scalar = {
    branchId: data.branchId,
    title: data.title,
    description: data.description,
    category: data.category,
    era: data.era,
    brand: data.brand,
    team: data.team ?? null,
    season: data.season ?? null,
    kitType: data.kitType ?? null,
    authenticity: data.authenticity ?? null,
    playerPrint: data.playerPrint ?? null,
    decade: data.decade ?? null,
    condition: data.condition,
    flaws: data.flaws,
    measurements: data.measurements,
    material: data.material ?? null,
    colour: data.colour ?? null,
    pricePaise: data.pricePaise,
    compareAtPaise: data.compareAtPaise ?? null,
    rackLocation: data.rackLocation ?? null,
    tags: data.tags,
  };
  const images = data.images.map((url, position) => ({ url, position, altText: `${data.title}, photo ${position + 1}` }));

  if (!input.id) {
    const product = await db.product.create({
      data: {
        ...scalar,
        slug: await uniqueSlug(data.title),
        sku: await nextSku(data.branchId),
        status: "DRAFT",
        images: { create: images },
        variants: { create: data.variants },
      },
    });
    await audit(actor, "product.create", product.id);
    return product;
  }

  const existing = await db.product.findUnique({ where: { id: input.id }, include: { variants: { include: { orderItems: { select: { id: true } } } } } });
  if (!existing) throw new DomainError("NOT_FOUND", "Product not found.");
  assertBranchAccess(actor, existing.branchId);
  if (existing.status === "PUBLISHED") {
    const problems = publishProblems({ ...scalar, images });
    if (problems.length) throw new DomainError("CANNOT_PUBLISH", problems.join(" "));
  }

  const product = await db.$transaction(async (tx) => {
    await tx.productImage.deleteMany({ where: { productId: existing.id } });
    // Sizes that were ordered stay (order history points at them); others can be removed.
    const keep = new Set(data.variants.map((v) => v.size));
    for (const v of existing.variants) {
      if (!keep.has(v.size)) {
        if (v.orderItems.length) await tx.productVariant.update({ where: { id: v.id }, data: { stockQty: 0 } });
        else await tx.productVariant.delete({ where: { id: v.id } });
      }
    }
    for (const v of data.variants) {
      await tx.productVariant.upsert({
        where: { productId_size: { productId: existing.id, size: v.size } },
        create: { productId: existing.id, size: v.size, stockQty: v.stockQty },
        update: { stockQty: v.stockQty },
      });
    }
    return tx.product.update({
      where: { id: existing.id },
      data: {
        ...scalar,
        slug: existing.title === data.title ? existing.slug : await uniqueSlug(data.title, existing.id),
        images: { create: images },
        // Restocking a sold-out latest item makes it available again as a draft.
        ...(existing.status === "SOLD" && data.variants.some((v) => v.stockQty > 0) ? { status: "DRAFT", soldAt: null } : {}),
      },
    });
  });
  await audit(actor, "product.update", product.id);
  return product;
}

export async function setProductStatus(input: { id: string; status: "PUBLISHED" | "HIDDEN" | "DRAFT"; actor: AdminActor }) {
  const product = await db.product.findUnique({ where: { id: input.id }, include: { images: true, variants: true } });
  if (!product) throw new DomainError("NOT_FOUND", "Product not found.");
  assertBranchAccess(input.actor, product.branchId);
  if (input.status === "PUBLISHED") {
    const problems = publishProblems(product);
    if (problems.length) throw new DomainError("CANNOT_PUBLISH", problems.join(" "));
    if (product.variants.every((v) => v.stockQty <= 0)) throw new DomainError("CANNOT_PUBLISH", "There's no stock to sell.");
  }
  if (product.status === "SOLD" && input.status !== "HIDDEN") {
    throw new DomainError("INVALID_STATE", "This piece is sold. Add stock to relist it.");
  }
  const updated = await db.product.update({
    where: { id: input.id },
    data: { status: input.status, ...(input.status === "PUBLISHED" && !product.publishedAt ? { publishedAt: new Date() } : {}) },
  });
  await audit(input.actor, `product.${input.status.toLowerCase()}`, product.id);
  return updated;
}

// BR7: a piece sold at the till disappears online at once.
export async function markSoldInStore(input: { variantId: string; actor: AdminActor }) {
  return db.$transaction(async (tx) => {
    await lockVariants(tx, [input.variantId]);
    const variant = await tx.productVariant.findUnique({ where: { id: input.variantId }, include: { product: true } });
    if (!variant) throw new DomainError("NOT_FOUND", "Size not found.");
    assertBranchAccess(input.actor, variant.product.branchId);
    if (variant.stockQty <= 0) throw new DomainError("INVALID_STATE", "Already out of stock.");

    const paidHolds = await tx.reservation.findMany({
      where: { variantId: variant.id, ...activeReservationWhere(), expiresAt: null },
      include: { checkout: { include: { orders: { where: { status: "AWAITING_APPROVAL" }, select: { number: true } } } } },
    });
    const heldUnits = paidHolds.reduce((s, r) => s + r.quantity, 0);
    if (variant.stockQty - heldUnits <= 0) {
      const numbers = paidHolds.flatMap((r) => r.checkout.orders.map((o) => o.number));
      throw new DomainError(
        "HELD_BY_ORDER",
        `A paid online order is holding this piece (${numbers.join(", ")}). Reject that order with "Item sold in store" instead.`,
      );
    }

    await tx.productVariant.update({ where: { id: variant.id }, data: { stockQty: { decrement: 1 } } });
    await markSoldIfEmpty(tx, variant.productId);
    await tx.auditLog.create({
      data: { adminId: input.actor.id, action: "product.sold_in_store", entity: "Product", entityId: variant.productId, after: { size: variant.size } },
    });
  });
}

export async function duplicateProduct(input: { id: string; actor: AdminActor }) {
  const p = await db.product.findUnique({ where: { id: input.id }, include: { variants: true } });
  if (!p) throw new DomainError("NOT_FOUND", "Product not found.");
  assertBranchAccess(input.actor, p.branchId);
  const copy = await db.product.create({
    data: {
      branchId: p.branchId,
      title: `${p.title} (copy)`,
      description: p.description,
      category: p.category,
      era: p.era,
      brand: p.brand,
      team: p.team,
      season: p.season,
      kitType: p.kitType,
      authenticity: p.authenticity,
      decade: p.decade,
      condition: p.condition,
      measurements: p.measurements ?? {},
      material: p.material,
      colour: p.colour,
      pricePaise: p.pricePaise,
      compareAtPaise: p.compareAtPaise,
      tags: p.tags,
      slug: await uniqueSlug(`${p.title} copy`),
      sku: await nextSku(p.branchId),
      status: "DRAFT",
      // Photos, flaws and rack location are specific to each piece, so they aren't copied.
      variants: { create: p.variants.map((v) => ({ size: v.size, stockQty: p.era === "RETRO" ? 1 : v.stockQty })) },
    },
  });
  await audit(input.actor, "product.duplicate", copy.id, { from: p.id });
  return copy;
}
