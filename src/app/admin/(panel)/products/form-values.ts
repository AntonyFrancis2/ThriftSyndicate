import type { ProductFormValues } from "./product-form";

type ProductWithRelations = {
  branchId: string;
  title: string;
  description: string;
  category: ProductFormValues["category"];
  era: ProductFormValues["era"];
  brand: string;
  team: string | null;
  season: string | null;
  kitType: string | null;
  authenticity: string | null;
  playerPrint: string | null;
  decade: number | null;
  condition: string;
  flaws: string[];
  measurements: unknown;
  material: string | null;
  colour: string | null;
  pricePaise: number;
  compareAtPaise: number | null;
  rackLocation: string | null;
  tags: string[];
  images: { url: string }[];
  variants: { size: string; stockQty: number }[];
};

export function toFormValues(p: ProductWithRelations): ProductFormValues {
  return {
    branchId: p.branchId,
    title: p.title,
    description: p.description,
    category: p.category,
    era: p.era,
    brand: p.brand,
    team: p.team ?? "",
    season: p.season ?? "",
    kitType: p.kitType ?? "",
    authenticity: p.authenticity ?? "",
    playerPrint: p.playerPrint ?? "",
    decade: p.decade ? String(p.decade) : "",
    condition: p.condition,
    flaws: p.flaws.join("\n"),
    measurements: Object.fromEntries(Object.entries((p.measurements ?? {}) as Record<string, number>).map(([k, v]) => [k, String(v)])),
    material: p.material ?? "",
    colour: p.colour ?? "",
    price: String(p.pricePaise / 100),
    compareAt: p.compareAtPaise ? String(p.compareAtPaise / 100) : "",
    rackLocation: p.rackLocation ?? "",
    tags: p.tags.join(", "),
    images: p.images.map((i) => i.url).join("\n"),
    variants: p.variants.map((v) => ({ size: v.size, stockQty: String(v.stockQty) })),
  };
}

export function emptyFormValues(branchId: string): ProductFormValues {
  return {
    branchId, title: "", description: "", category: "TSHIRT", era: "RETRO", brand: "", team: "", season: "", kitType: "", authenticity: "",
    playerPrint: "", decade: "", condition: "EXCELLENT", flaws: "", measurements: {}, material: "", colour: "", price: "", compareAt: "",
    rackLocation: "", tags: "", images: "", variants: [{ size: "", stockQty: "1" }],
  };
}
