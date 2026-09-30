import type { OrderStatus } from "@/generated/prisma/enums";
import { customerStatusLabel } from "@/lib/orders/status";

export function StatusBadge({ status, className = "" }: { status: OrderStatus; className?: string }) {
  const tone =
    status === "REJECTED" || status === "CANCELLED" || status === "EXPIRED"
      ? "border-steel text-steel"
      : status === "AWAITING_APPROVAL" || status === "PENDING_PAYMENT"
        ? "border-ink text-ink"
        : "border-ink bg-ink text-paper";
  return <span className={`tag ${tone} ${className}`}>{customerStatusLabel[status]}</span>;
}
