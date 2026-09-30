// Money is always integer paise. Prices shown to customers include GST (PRD §14 assumptions).

export function rupeesToPaise(rupees: number): number {
  return Math.round(rupees * 100);
}

export function formatINR(paise: number): string {
  const rupees = paise / 100;
  return rupees.toLocaleString("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: Number.isInteger(rupees) ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

// GST on apparel from 22 Sep 2025: 5% on items up to ₹2,500 per piece, 18% above.
// Confirm with the store's accountant before launch.
export const GST_THRESHOLD_PAISE = 250_000;

export function gstRateForItem(unitPricePaise: number): number {
  return unitPricePaise <= GST_THRESHOLD_PAISE ? 5 : 18;
}

// GST contained in a tax-inclusive price.
export function includedGst(pricePaise: number, ratePercent: number): number {
  return Math.round((pricePaise * ratePercent) / (100 + ratePercent));
}

export function includedGstForItems(items: { pricePaise: number; quantity: number }[]): number {
  return items.reduce(
    (sum, item) => sum + includedGst(item.pricePaise, gstRateForItem(item.pricePaise)) * item.quantity,
    0,
  );
}
