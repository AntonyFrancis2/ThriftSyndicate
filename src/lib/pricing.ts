import { storeConfig } from "@/lib/config";

// Shared by the server (authoritative) and the bag preview.
export function shippingFor(deliveryType: "HOME" | "PICKUP", subtotalPaise: number): number {
  if (deliveryType === "PICKUP") return 0;
  return subtotalPaise >= storeConfig.freeShippingThresholdPaise ? 0 : storeConfig.shippingFeePaise;
}
