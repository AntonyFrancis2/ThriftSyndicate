import { randomBytes } from "node:crypto";
import { storeConfig } from "@/lib/config";
import { db } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import { includedGstForItems } from "@/lib/money";
import { getGateway } from "@/lib/payments";
import type { ValidCheckout } from "./checkout-schema";
import { heldQuantities, lockVariants } from "./inventory";

export function shippingFor(deliveryType: "HOME" | "PICKUP", subtotalPaise: number): number {
  if (deliveryType === "PICKUP") return 0;
  return subtotalPaise >= storeConfig.freeShippingThresholdPaise ? 0 : storeConfig.shippingFeePaise;
}

export function newOrderNumber(branchCode: string, now = new Date()): string {
  const yymmdd = now.toISOString().slice(2, 10).replaceAll("-", "");
  const suffix = randomBytes(3).toString("hex").toUpperCase().slice(0, 5);
  return `TS-${branchCode}-${yymmdd}-${suffix}`;
}

export interface CreatedCheckout {
  checkoutId: string;
  accessToken: string;
  razorpayOrderId: string;
  amountPaise: number;
  keyId: string;
  gatewayMode: "razorpay" | "mock";
  orderNumbers: string[];
  customer: { name: string; email: string; phone: string };
}

// Starts payment: reserves every item for 15 minutes (BR5), splits the bag into one order per
// branch under a single payment (BR6), and creates the Razorpay order for the server-computed total.
export async function createCheckout(input: ValidCheckout, now = new Date()): Promise<CreatedCheckout> {
  const quantities = new Map<string, number>();
  for (const item of input.items) {
    quantities.set(item.variantId, (quantities.get(item.variantId) ?? 0) + item.quantity);
  }
  const variantIds = [...quantities.keys()];
  const expiresAt = new Date(now.getTime() + storeConfig.reservationMinutes * 60_000);

  const created = await db.$transaction(async (tx) => {
    await lockVariants(tx, variantIds);

    const variants = await tx.productVariant.findMany({
      where: { id: { in: variantIds } },
      include: {
        product: {
          include: { branch: true, images: { orderBy: { position: "asc" }, take: 1 } },
        },
      },
    });
    const held = await heldQuantities(tx, variantIds);

    const unavailable: string[] = [];
    for (const id of variantIds) {
      const v = variants.find((x) => x.id === id);
      const wanted = quantities.get(id)!;
      if (!v || v.product.status !== "PUBLISHED" || v.stockQty - (held.get(id) ?? 0) < wanted) {
        unavailable.push(id);
      }
    }
    if (unavailable.length > 0) {
      throw new DomainError("ITEMS_UNAVAILABLE", "Some items in your bag were just taken by another shopper.", {
        variantIds: unavailable,
      });
    }

    const branches = new Map(variants.map((v) => [v.product.branchId, v.product.branch]));
    if (input.deliveryType === "PICKUP" && [...branches.values()].some((b) => !b.pickupEnabled)) {
      throw new DomainError("PICKUP_UNAVAILABLE", "Pick up isn't available for one of the stores in your bag.");
    }

    const existing = await tx.customer.findUnique({ where: { phone: input.contact.phone } });
    if (existing?.blocked) {
      throw new DomainError("CUSTOMER_BLOCKED", "We can't take this order online. Please contact the store.");
    }
    const customer = await tx.customer.upsert({
      where: { phone: input.contact.phone },
      create: {
        name: input.contact.name,
        phone: input.contact.phone,
        email: input.contact.email,
        marketingConsent: input.contact.marketingConsent,
      },
      update: {
        name: input.contact.name,
        email: input.contact.email,
        marketingConsent: input.contact.marketingConsent || existing?.marketingConsent,
      },
    });

    // One order per branch.
    const drafts = [...branches.values()].map((branch) => {
      const lines = variants
        .filter((v) => v.product.branchId === branch.id)
        .map((v) => ({
          variantId: v.id,
          title: v.product.title,
          size: v.size,
          imageUrl: v.product.images[0]?.url ?? null,
          pricePaise: v.product.pricePaise,
          quantity: quantities.get(v.id)!,
        }));
      const subtotalPaise = lines.reduce((s, l) => s + l.pricePaise * l.quantity, 0);
      const shippingPaise = shippingFor(input.deliveryType, subtotalPaise);
      return {
        branch,
        lines,
        subtotalPaise,
        shippingPaise,
        taxPaise: includedGstForItems(lines),
        totalPaise: subtotalPaise + shippingPaise,
      };
    });
    const totalPaise = drafts.reduce((s, d) => s + d.totalPaise, 0);

    const checkout = await tx.checkout.create({
      data: {
        customerId: customer.id,
        totalPaise,
        deliveryType: input.deliveryType,
        address: input.deliveryType === "HOME" ? input.address : undefined,
        finalSaleAcceptedAt: now,
        // Replaced with the real Razorpay order id right after this transaction.
        razorpayOrderId: `pending_${randomBytes(12).toString("hex")}`,
        accessToken: randomBytes(24).toString("base64url"),
        reservationExpiresAt: expiresAt,
        reservations: {
          create: variantIds.map((variantId) => ({ variantId, quantity: quantities.get(variantId)!, expiresAt })),
        },
      },
    });

    const orders = [];
    for (const d of drafts) {
      orders.push(
        await tx.order.create({
          data: {
            number: newOrderNumber(d.branch.code, now),
            checkoutId: checkout.id,
            customerId: customer.id,
            branchId: d.branch.id,
            subtotalPaise: d.subtotalPaise,
            shippingPaise: d.shippingPaise,
            taxPaise: d.taxPaise,
            totalPaise: d.totalPaise,
            deliveryType: input.deliveryType,
            address: input.deliveryType === "HOME" ? input.address : undefined,
            customerNote: input.note,
            items: { create: d.lines },
            events: { create: { status: "PENDING_PAYMENT", message: "Checkout started" } },
          },
        }),
      );
    }

    return { checkout, orders, customer };
  });

  const gateway = getGateway();
  let razorpayOrderId: string;
  try {
    const rzpOrder = await gateway.createOrder({
      amountPaise: created.checkout.totalPaise,
      receipt: created.orders[0].number,
      notes: { checkoutId: created.checkout.id, orders: created.orders.map((o) => o.number).join(",") },
    });
    razorpayOrderId = rzpOrder.id;
  } catch (err) {
    // Give the items back straight away rather than holding them for 15 minutes.
    await db.$transaction([
      db.reservation.updateMany({ where: { checkoutId: created.checkout.id }, data: { status: "RELEASED" } }),
      db.checkout.update({ where: { id: created.checkout.id }, data: { status: "FAILED" } }),
      db.order.updateMany({ where: { checkoutId: created.checkout.id }, data: { status: "EXPIRED" } }),
    ]);
    throw new DomainError("PAYMENT_START_FAILED", "We couldn't start the payment. Please try again.", err);
  }

  await db.checkout.update({ where: { id: created.checkout.id }, data: { razorpayOrderId } });

  return {
    checkoutId: created.checkout.id,
    accessToken: created.checkout.accessToken,
    razorpayOrderId,
    amountPaise: created.checkout.totalPaise,
    keyId: gateway.keyId,
    gatewayMode: gateway.mode,
    orderNumbers: created.orders.map((o) => o.number),
    customer: { name: created.customer.name, email: created.customer.email, phone: created.customer.phone },
  };
}
