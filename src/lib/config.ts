// Store rules that the PRD marks "to confirm with owners". Change them here, in one place.

export const storeConfig = {
  name: "ThriftSyndicate",
  // BR5: how long items are held once the customer clicks Pay.
  reservationMinutes: 15,
  // BR4: alert the super admin at 24 h, auto-reject and refund at 48 h.
  approvalAlertHours: 24,
  approvalDeadlineHours: 48,
  // Shipping per branch parcel (BR6 splits a bag into one parcel per branch).
  shippingFeePaise: 9_900,
  freeShippingThresholdPaise: 199_900,
  // Sold items stay on the listing with a "Sold" overlay for this long (PRD §6.2).
  soldVisibleDays: 7,
  // Minimum photos before a product can be published (BR9).
  minPhotos: 4,
  maxPhotos: 8,
  // Use Razorpay Instant Refunds for rejections (open question in PRD §14).
  instantRefunds: false,
} as const;

export function siteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
}
