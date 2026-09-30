import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { createCheckout } from "@/lib/orders/checkout";
import { markSoldInStore, saveProduct, setProductStatus, productFormSchema } from "@/lib/products";
import { checkoutInput, makeAdmin, makeBranch, makeProduct, placePaidOrder, resetDb } from "./helpers";

beforeEach(resetDb);

const form = (branchId: string, overrides: Record<string, unknown> = {}) =>
  productFormSchema.parse({
    branchId,
    title: "Arsenal 2004 Invincibles Home",
    category: "JERSEY",
    era: "RETRO",
    brand: "Nike",
    team: "Arsenal",
    condition: "EXCELLENT",
    measurements: { chest: 55, length: 74 },
    pricePaise: 399_900,
    images: ["/a.jpg", "/b.jpg", "/c.jpg"],
    variants: [{ size: "l", stockQty: 1 }],
    ...overrides,
  });

describe("publishing (BR9)", () => {
  it("blocks publishing without 4 photos and the right measurements", async () => {
    const b = await makeBranch("AAA");
    const admin = await makeAdmin("BRANCH_ADMIN", b.id);
    const p = await saveProduct({ data: form(b.id, { measurements: { chest: 55 } }), actor: admin });
    expect(p.status).toBe("DRAFT");
    expect(p.sku).toBe("AAA-1001");

    await expect(setProductStatus({ id: p.id, status: "PUBLISHED", actor: admin })).rejects.toThrow(/at least 4 photos.*length/);

    await saveProduct({ id: p.id, data: form(b.id, { images: ["/a", "/b", "/c", "/d"] }), actor: admin });
    const published = await setProductStatus({ id: p.id, status: "PUBLISHED", actor: admin });
    expect(published.status).toBe("PUBLISHED");
    expect(published.publishedAt).not.toBeNull();
  });

  it("keeps branch admins to their own branch", async () => {
    const a = await makeBranch("AAA");
    const b = await makeBranch("BBB");
    const adminB = await makeAdmin("BRANCH_ADMIN", b.id);
    await expect(saveProduct({ data: form(a.id), actor: adminB })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("mark sold in store (BR7)", () => {
  it("takes the piece off the site", async () => {
    const b = await makeBranch("AAA");
    const admin = await makeAdmin("BRANCH_ADMIN", b.id);
    const p = await makeProduct(b.id);
    await markSoldInStore({ variantId: p.variants[0].id, actor: admin });
    expect((await db.product.findUniqueOrThrow({ where: { id: p.id } })).status).toBe("SOLD");
    await expect(createCheckout(checkoutInput([p.variants[0].id]))).rejects.toMatchObject({ code: "ITEMS_UNAVAILABLE" });
  });

  it("refuses when a paid online order holds the piece", async () => {
    const b = await makeBranch("AAA");
    const admin = await makeAdmin("BRANCH_ADMIN", b.id);
    const p = await makeProduct(b.id);
    await placePaidOrder([p.variants[0].id]);
    await expect(markSoldInStore({ variantId: p.variants[0].id, actor: admin })).rejects.toMatchObject({ code: "HELD_BY_ORDER" });
  });

  it("sells one unit of a multi-size latest item", async () => {
    const b = await makeBranch("AAA");
    const admin = await makeAdmin("BRANCH_ADMIN", b.id);
    const p = await makeProduct(b.id, { stockQty: 2 });
    await markSoldInStore({ variantId: p.variants[0].id, actor: admin });
    const after = await db.product.findUniqueOrThrow({ where: { id: p.id }, include: { variants: true } });
    expect(after.status).toBe("PUBLISHED");
    expect(after.variants[0].stockQty).toBe(1);
  });
});
