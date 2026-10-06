import "server-only";
import { Prisma } from "@/generated/prisma/client";
import type { Category, Condition, Era } from "@/generated/prisma/enums";
import { storeConfig } from "@/lib/config";
import { db } from "@/lib/db";
import { activeReservationWhere } from "@/lib/orders/inventory";

export const PAGE_SIZE = 24;

export const categoryLabel: Record<Category, string> = { TSHIRT: "T-shirts", JEANS: "Jeans", JERSEY: "Jerseys" };
export const categorySlug: Record<Category, string> = { TSHIRT: "t-shirts", JEANS: "jeans", JERSEY: "jerseys" };
export const eraLabel: Record<Era, string> = { RETRO: "Retro", LATEST: "Latest" };
export const conditionLabel: Record<Condition, string> = {
  DEADSTOCK: "Deadstock",
  EXCELLENT: "Excellent",
  VERY_GOOD: "Very good",
  GOOD: "Good",
  NEW: "New",
  LIKE_NEW: "Like new",
};
export const conditionMeaning: Record<Condition, string> = {
  DEADSTOCK: "Never worn, may have original tags",
  EXCELLENT: "Worn lightly, no visible flaws",
  VERY_GOOD: "Minor signs of wear, e.g. slight fading; flaws photographed",
  GOOD: "Visible wear such as cracked print or small marks; priced accordingly, flaws photographed",
  NEW: "Current season, never worn",
  LIKE_NEW: "Current season, worn once or twice, no flaws",
};

export interface ListingFilters {
  q?: string;
  category?: Category;
  era?: Era;
  size?: string;
  brand?: string;
  team?: string;
  decade?: number;
  condition?: Condition;
  minPaise?: number;
  maxPaise?: number;
  branch?: string;
  inStock?: boolean;
  sort: "newest" | "price_asc" | "price_desc";
  page: number;
}

type Params = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim() || undefined;

// Filters live in the URL so links can be shared (PRD §6.2).
export function parseFilters(sp: Params): ListingFilters {
  const category = Object.entries(categorySlug).find(([, slug]) => slug === one(sp.category))?.[0] as Category | undefined;
  const era = one(sp.era)?.toUpperCase();
  const condition = one(sp.condition)?.toUpperCase();
  const num = (v?: string) => (v && /^\d+$/.test(v) ? Number(v) : undefined);
  const sort = one(sp.sort);
  return {
    q: one(sp.q)?.slice(0, 80),
    category,
    era: era === "RETRO" || era === "LATEST" ? era : undefined,
    size: one(sp.size)?.toUpperCase(),
    brand: one(sp.brand),
    team: one(sp.team),
    decade: num(one(sp.decade)),
    condition: condition && condition in conditionLabel ? (condition as Condition) : undefined,
    minPaise: num(one(sp.min)) !== undefined ? num(one(sp.min))! * 100 : undefined,
    maxPaise: num(one(sp.max)) !== undefined ? num(one(sp.max))! * 100 : undefined,
    branch: one(sp.branch),
    inStock: one(sp.instock) === "1",
    sort: sort === "price_asc" || sort === "price_desc" ? sort : "newest",
    page: Math.max(1, num(one(sp.page)) ?? 1),
  };
}

// "tee" = T-shirt, "denim" = jeans (PRD §6.3). Matching words become a category filter.
const categorySynonyms: Record<string, Category> = {
  tee: "TSHIRT", tees: "TSHIRT", tshirt: "TSHIRT", tshirts: "TSHIRT", "t-shirt": "TSHIRT", "t-shirts": "TSHIRT",
  jeans: "JEANS", denim: "JEANS", denims: "JEANS",
  jersey: "JERSEY", jerseys: "JERSEY", kit: "JERSEY", kits: "JERSEY",
};
const eraSynonyms: Record<string, Era> = { retro: "RETRO", vintage: "RETRO", latest: "LATEST", new: "LATEST" };

export function interpretQuery(q: string) {
  let category: Category | undefined;
  let era: Era | undefined;
  const rest: string[] = [];
  for (const word of q.toLowerCase().split(/\s+/).filter(Boolean)) {
    if (categorySynonyms[word]) category = categorySynonyms[word];
    else if (eraSynonyms[word]) era = eraSynonyms[word];
    else rest.push(word);
  }
  return { category, era, text: rest.join(" ") };
}

// Typo-tolerant text match via pg_trgm; returns matching product ids.
async function searchIds(text: string): Promise<string[]> {
  const rows = await db.$queryRaw<{ id: string }[]>`
    SELECT id FROM "Product"
    WHERE status IN ('PUBLISHED', 'SOLD')
      AND (
        word_similarity(${text}, lower(title || ' ' || brand || ' ' || coalesce(team, ''))) > 0.4
        OR lower(title || ' ' || brand || ' ' || coalesce(team, '')) LIKE ${"%" + text + "%"}
      )
    ORDER BY word_similarity(${text}, lower(title || ' ' || brand || ' ' || coalesce(team, ''))) DESC
    LIMIT 500`;
  return rows.map((r) => r.id);
}

export type Availability = "available" | "on_hold" | "sold";

async function availabilityFor(products: { id: string; status: string; variants: { id: string; stockQty: number }[] }[]) {
  const variantIds = products.flatMap((p) => p.variants.map((v) => v.id));
  const held = await db.reservation.groupBy({
    by: ["variantId"],
    where: { variantId: { in: variantIds }, ...activeReservationWhere() },
    _sum: { quantity: true },
  });
  const heldMap = new Map(held.map((h) => [h.variantId, h._sum.quantity ?? 0]));
  const result = new Map<string, { status: Availability; freeSizes: string[] }>();
  for (const p of products) {
    const stock = p.variants.reduce((s, v) => s + v.stockQty, 0);
    const free = p.variants.filter((v) => v.stockQty - (heldMap.get(v.id) ?? 0) > 0);
    const status: Availability = p.status === "SOLD" || stock <= 0 ? "sold" : free.length === 0 ? "on_hold" : "available";
    result.set(p.id, { status, freeSizes: free.map((v) => v.id) });
  }
  return result;
}

const cardInclude = {
  images: { orderBy: { position: "asc" }, take: 2 },
  variants: { orderBy: { size: "asc" } },
  branch: { select: { id: true, name: true } },
} satisfies Prisma.ProductInclude;

export async function listProducts(filters: ListingFilters) {
  const soldCutoff = new Date(Date.now() - storeConfig.soldVisibleDays * 86_400_000);
  const and: Prisma.ProductWhereInput[] = [
    filters.inStock
      ? { status: "PUBLISHED" }
      : { OR: [{ status: "PUBLISHED" }, { status: "SOLD", soldAt: { gt: soldCutoff } }] },
  ];

  let category = filters.category;
  let era = filters.era;
  if (filters.q) {
    const parsed = interpretQuery(filters.q);
    category ??= parsed.category;
    era ??= parsed.era;
    if (parsed.text) and.push({ id: { in: await searchIds(parsed.text) } });
  }
  if (category) and.push({ category });
  if (era) and.push({ era });
  if (filters.size) and.push({ variants: { some: { size: { equals: filters.size, mode: "insensitive" }, stockQty: { gt: 0 } } } });
  if (filters.brand) and.push({ brand: { equals: filters.brand, mode: "insensitive" } });
  if (filters.team) and.push({ team: { equals: filters.team, mode: "insensitive" } });
  if (filters.decade) and.push({ decade: filters.decade });
  if (filters.condition) and.push({ condition: filters.condition });
  if (filters.minPaise !== undefined) and.push({ pricePaise: { gte: filters.minPaise } });
  if (filters.maxPaise !== undefined) and.push({ pricePaise: { lte: filters.maxPaise } });
  if (filters.branch) and.push({ branchId: filters.branch });

  const where: Prisma.ProductWhereInput = { AND: and };
  const orderBy: Prisma.ProductOrderByWithRelationInput[] =
    filters.sort === "price_asc"
      ? [{ pricePaise: "asc" }]
      : filters.sort === "price_desc"
        ? [{ pricePaise: "desc" }]
        : [{ publishedAt: "desc" }, { createdAt: "desc" }];

  const [total, products] = await Promise.all([
    db.product.count({ where }),
    db.product.findMany({ where, orderBy, include: cardInclude, take: PAGE_SIZE * filters.page }),
  ]);
  const availability = await availabilityFor(products);
  return {
    total,
    products: products.map((p) => ({ ...p, availability: availability.get(p.id)!.status })),
  };
}

export async function newestProducts(limit = 12) {
  const products = await db.product.findMany({
    where: { status: "PUBLISHED" },
    orderBy: { publishedAt: "desc" },
    include: cardInclude,
    take: limit,
  });
  const availability = await availabilityFor(products);
  return products.map((p) => ({ ...p, availability: availability.get(p.id)!.status }));
}

export async function getProductBySlug(slug: string) {
  const product = await db.product.findUnique({
    where: { slug },
    include: { images: { orderBy: { position: "asc" } }, variants: { orderBy: { size: "asc" } }, branch: true },
  });
  if (!product || (product.status !== "PUBLISHED" && product.status !== "SOLD")) return null;
  const availability = await availabilityFor([product]);
  const a = availability.get(product.id)!;
  return { ...product, availability: a.status, freeVariantIds: a.freeSizes };
}

export async function relatedProducts(product: { id: string; category: Category; era: Era }, limit = 4) {
  const products = await db.product.findMany({
    where: { status: "PUBLISHED", category: product.category, era: product.era, id: { not: product.id } },
    orderBy: { publishedAt: "desc" },
    include: cardInclude,
    take: limit,
  });
  const availability = await availabilityFor(products);
  return products.map((p) => ({ ...p, availability: availability.get(p.id)!.status }));
}

export async function filterFacets() {
  const [brands, teams, branches] = await Promise.all([
    db.product.findMany({ where: { status: "PUBLISHED" }, distinct: ["brand"], select: { brand: true }, orderBy: { brand: "asc" } }),
    db.product.findMany({ where: { status: "PUBLISHED", team: { not: null } }, distinct: ["team"], select: { team: true }, orderBy: { team: "asc" } }),
    db.branch.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  return { brands: brands.map((b) => b.brand), teams: teams.map((t) => t.team!), branches };
}

export type ProductCardData = Awaited<ReturnType<typeof newestProducts>>[number];
