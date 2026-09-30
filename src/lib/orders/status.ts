import type { DeliveryType, OrderStatus } from "@/generated/prisma/enums";

// Allowed order status changes (PRD §5 and §7.3).
const transitions: Record<OrderStatus, OrderStatus[]> = {
  PENDING_PAYMENT: ["AWAITING_APPROVAL", "EXPIRED"],
  AWAITING_APPROVAL: ["CONFIRMED", "REJECTED", "CANCELLED"],
  CONFIRMED: ["PACKED"],
  PACKED: ["SHIPPED", "READY_FOR_PICKUP"],
  SHIPPED: ["DELIVERED"],
  READY_FOR_PICKUP: ["COLLECTED"],
  DELIVERED: [],
  COLLECTED: [],
  REJECTED: [],
  CANCELLED: [],
  EXPIRED: [],
};

export function canTransition(from: OrderStatus, to: OrderStatus, delivery?: DeliveryType): boolean {
  if (!transitions[from].includes(to)) return false;
  if (to === "SHIPPED" && delivery === "PICKUP") return false;
  if (to === "READY_FOR_PICKUP" && delivery === "HOME") return false;
  return true;
}

// The next fulfilment step an admin can take after approval.
export function nextFulfilmentStatus(status: OrderStatus, delivery: DeliveryType): OrderStatus | null {
  switch (status) {
    case "CONFIRMED":
      return "PACKED";
    case "PACKED":
      return delivery === "HOME" ? "SHIPPED" : "READY_FOR_PICKUP";
    case "SHIPPED":
      return "DELIVERED";
    case "READY_FOR_PICKUP":
      return "COLLECTED";
    default:
      return null;
  }
}

// Labels customers see (PRD §6.8).
export const customerStatusLabel: Record<OrderStatus, string> = {
  PENDING_PAYMENT: "Awaiting payment",
  AWAITING_APPROVAL: "Awaiting approval",
  CONFIRMED: "Confirmed",
  PACKED: "Packed",
  SHIPPED: "Shipped",
  READY_FOR_PICKUP: "Ready for pickup",
  DELIVERED: "Delivered",
  COLLECTED: "Collected",
  REJECTED: "Rejected (refunded)",
  CANCELLED: "Cancelled",
  EXPIRED: "Payment not completed",
};

export const rejectionReasonLabel = {
  SOLD_IN_STORE: "Item sold in store",
  DAMAGED: "Item damaged",
  CANNOT_LOCATE: "Can't locate item",
  SUSPECTED_FRAUD: "Suspected fraud",
  NOT_AVAILABLE_AT_PAYMENT: "Item no longer available when payment arrived",
  AUTO_TIMEOUT: "No decision within 48 hours",
  OTHER: "Other",
} as const;
