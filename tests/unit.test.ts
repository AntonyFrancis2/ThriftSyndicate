import { describe, expect, it } from "vitest";
import { checkoutSchema } from "@/lib/orders/checkout-schema";
import { canTransition, nextFulfilmentStatus } from "@/lib/orders/status";
import { formatINR, includedGst, gstRateForItem } from "@/lib/money";
import { hmacHex, hmacMatches } from "@/lib/payments/gateway";
import { interpretQuery } from "@/lib/catalog";
import { slugify } from "@/lib/products";
import { newOrderNumber } from "@/lib/orders/checkout";

describe("order status rules", () => {
  it("only awaiting-approval orders can be approved, rejected or cancelled", () => {
    expect(canTransition("AWAITING_APPROVAL", "CONFIRMED")).toBe(true);
    expect(canTransition("AWAITING_APPROVAL", "REJECTED")).toBe(true);
    expect(canTransition("AWAITING_APPROVAL", "CANCELLED")).toBe(true);
    expect(canTransition("CONFIRMED", "CANCELLED")).toBe(false); // BR8
    expect(canTransition("PENDING_PAYMENT", "CONFIRMED")).toBe(false); // BR2
  });

  it("routes packed orders by delivery type", () => {
    expect(nextFulfilmentStatus("PACKED", "HOME")).toBe("SHIPPED");
    expect(nextFulfilmentStatus("PACKED", "PICKUP")).toBe("READY_FOR_PICKUP");
    expect(canTransition("PACKED", "SHIPPED", "PICKUP")).toBe(false);
    expect(nextFulfilmentStatus("DELIVERED", "HOME")).toBeNull();
  });
});

describe("money", () => {
  it("formats rupees", () => {
    expect(formatINR(99_900)).toBe("₹999");
    expect(formatINR(1_49_950)).toBe("₹1,499.50");
  });

  it("extracts included GST at 5% up to ₹2,500 and 18% above", () => {
    expect(gstRateForItem(250_000)).toBe(5);
    expect(gstRateForItem(250_100)).toBe(18);
    expect(includedGst(105_000, 5)).toBe(5_000);
  });
});

describe("signatures", () => {
  it("accepts only the exact HMAC", () => {
    const sig = hmacHex("secret", "order_1|pay_1");
    expect(hmacMatches("secret", "order_1|pay_1", sig)).toBe(true);
    expect(hmacMatches("secret", "order_1|pay_2", sig)).toBe(false);
    expect(hmacMatches("other", "order_1|pay_1", sig)).toBe(false);
    expect(hmacMatches("secret", "order_1|pay_1", "")).toBe(false);
  });
});

describe("checkout input", () => {
  const base = {
    items: [{ variantId: "v1", quantity: 1 }],
    contact: { name: "Asha", phone: "+91 98765 43210", email: "asha@example.com" },
    deliveryType: "PICKUP" as const,
  };

  it("requires the final-sale checkbox (BR1)", () => {
    expect(checkoutSchema.safeParse({ ...base, finalSaleAccepted: false }).success).toBe(false);
    expect(checkoutSchema.safeParse(base).success).toBe(false);
  });

  it("normalises Indian mobile numbers", () => {
    const r = checkoutSchema.parse({ ...base, finalSaleAccepted: true });
    expect(r.contact.phone).toBe("9876543210");
    const phone = (v: string) => checkoutSchema.parse({ ...base, finalSaleAccepted: true, contact: { ...base.contact, phone: v } }).contact.phone;
    expect(phone("91234 56789")).toBe("9123456789"); // a number that itself starts with 91
    expect(phone("919123456789")).toBe("9123456789");
    expect(phone("09876543210")).toBe("9876543210");
  });

  it("needs an address for home delivery", () => {
    expect(checkoutSchema.safeParse({ ...base, deliveryType: "HOME", finalSaleAccepted: true }).success).toBe(false);
  });
});

describe("search synonyms", () => {
  it("maps tee and denim to categories", () => {
    expect(interpretQuery("vintage tee nike")).toEqual({ category: "TSHIRT", era: "RETRO", text: "nike" });
    expect(interpretQuery("denim")).toMatchObject({ category: "JEANS", text: "" });
  });
});

describe("slugs", () => {
  it("strips accents and punctuation", () => {
    expect(slugify("Stüssy Stock Logo Tee")).toBe("stussy-stock-logo-tee");
    expect(slugify("Levi's 501 — 1990s")).toBe("levi-s-501-1990s");
  });
});

describe("order numbers", () => {
  it("use the IST calendar day", () => {
    // 20:00 UTC on 30 Sep is 01:30 IST on 1 Oct.
    expect(newOrderNumber("IND", new Date("2026-09-30T20:00:00Z"))).toMatch(/^TS-IND-261001-[0-9A-F]{5}$/);
  });
});
