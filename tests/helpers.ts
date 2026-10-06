import { db } from "@/lib/db";
import type { AdminActor } from "@/lib/orders/decisions";
import { createCheckout } from "@/lib/orders/checkout";
import { checkoutSchema, type CheckoutInput } from "@/lib/orders/checkout-schema";
import { recordPayment } from "@/lib/orders/payment";
import { MockGateway } from "@/lib/payments/mock";
import { getGateway } from "@/lib/payments";

export async function resetDb() {
  const tables = await db.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  const list = tables.map((t) => `"public"."${t.tablename}"`).join(", ");
  await db.$executeRawUnsafe(`TRUNCATE ${list} RESTART IDENTITY CASCADE`);
}

let seq = 0;

export async function makeBranch(code: string) {
  return db.branch.create({
    data: { code, name: `Branch ${code}`, address: "1 Test Road", city: "Mumbai", pincode: "400001", phone: "9000000000", hours: "11–9" },
  });
}

export async function makeProduct(branchId: string, opts: { pricePaise?: number; stockQty?: number; sizes?: string[] } = {}) {
  seq++;
  const sizes = opts.sizes ?? ["M"];
  return db.product.create({
    data: {
      slug: `test-product-${seq}`,
      sku: `SKU-${seq}`,
      branchId,
      title: `Test tee ${seq}`,
      category: "TSHIRT",
      era: "RETRO",
      brand: "Nike",
      condition: "EXCELLENT",
      measurements: { chest: 54, length: 72 },
      pricePaise: opts.pricePaise ?? 99_900,
      status: "PUBLISHED",
      publishedAt: new Date(),
      variants: { create: sizes.map((size) => ({ size, stockQty: opts.stockQty ?? 1 })) },
    },
    include: { variants: true },
  });
}

export async function makeAdmin(role: "SUPER_ADMIN" | "BRANCH_ADMIN", branchId: string | null): Promise<AdminActor> {
  seq++;
  const a = await db.adminUser.create({
    data: { name: `Admin ${seq}`, email: `admin${seq}@test.local`, passwordHash: "x", role, branchId },
  });
  return { kind: "admin", id: a.id, role: a.role, branchId: a.branchId };
}

export function checkoutInput(variantIds: string[], overrides: Partial<CheckoutInput> = {}) {
  return checkoutSchema.parse({
    items: variantIds.map((variantId) => ({ variantId, quantity: 1 })),
    contact: { name: "Asha Rao", phone: "98765 43210", email: "asha@example.com" },
    deliveryType: "HOME",
    address: { line1: "12 MG Road", city: "Bengaluru", state: "Karnataka", pincode: "560001" },
    finalSaleAccepted: true,
    ...overrides,
  } satisfies CheckoutInput);
}

// Checkout + a captured mock payment, as if the customer paid in Razorpay Checkout.
export async function placePaidOrder(variantIds: string[], now = new Date()) {
  const c = await createCheckout(checkoutInput(variantIds), now);
  const gateway = getGateway() as MockGateway;
  const { payment } = gateway.capture(c.razorpayOrderId, c.amountPaise);
  await recordPayment(payment);
  return c;
}
