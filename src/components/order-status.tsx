import type { OrderStatus } from "@/generated/prisma/enums";
import { customerStatusLabel } from "@/lib/orders/status";

export function StatusBadge({ status, className = "" }: { status: OrderStatus; className?: string }) {
  const tone =
    status === "REJECTED" || status === "CANCELLED" || status === "EXPIRED"
      ? "border-steel text-steel"
      : status === "AWAITING_APPROVAL" || status === "PENDING_PAYMENT"
        ? "border-accent bg-accent text-ink"
        : "border-positive bg-positive text-ink";
  return <span className={`tag ${tone} ${className}`}>{customerStatusLabel[status]}</span>;
}
