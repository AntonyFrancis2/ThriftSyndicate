import "server-only";
import type { AdminActor } from "@/lib/orders/decisions";
import { branchScope } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { rejectionReasonLabel } from "@/lib/orders/status";

const approvedStatuses: string[] = ["CONFIRMED", "PACKED", "SHIPPED", "READY_FOR_PICKUP", "DELIVERED", "COLLECTED"];

// Sales and approval reports (PRD §7.8). Revenue counts approved orders, net of refunds.
export async function salesReport(admin: AdminActor, from: Date, to: Date, branchId?: string | null) {
  const scope = branchScope(admin, branchId);
  const orders = await db.order.findMany({
    where: { ...scope, paidAt: { gte: from, lt: to } },
    include: { branch: true, items: { include: { variant: { include: { product: true } } } } },
    orderBy: { paidAt: "asc" },
  });

  const approved = orders.filter((o) => approvedStatuses.includes(o.status));
  const byDay = new Map<string, { revenuePaise: number; orders: number }>();
  const byBranch = new Map<string, number>();
  const byCategory = new Map<string, number>();
  const byEra = new Map<string, number>();
  const byBrand = new Map<string, number>();
  const byTeam = new Map<string, number>();

  for (const o of approved) {
    const day = o.paidAt!.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
    const d = byDay.get(day) ?? { revenuePaise: 0, orders: 0 };
    d.revenuePaise += o.totalPaise - o.refundedPaise;
    d.orders += 1;
    byDay.set(day, d);
    byBranch.set(o.branch.name, (byBranch.get(o.branch.name) ?? 0) + o.totalPaise - o.refundedPaise);
    for (const i of o.items.filter((x) => x.status === "ACTIVE")) {
      const p = i.variant.product;
      const amount = i.pricePaise * i.quantity;
      byCategory.set(p.category, (byCategory.get(p.category) ?? 0) + amount);
      byEra.set(p.era, (byEra.get(p.era) ?? 0) + amount);
      byBrand.set(p.brand, (byBrand.get(p.brand) ?? 0) + i.quantity);
      if (p.team) byTeam.set(p.team, (byTeam.get(p.team) ?? 0) + i.quantity);
    }
  }

  const decided = orders.filter((o) => o.decidedAt && o.paidAt && o.status !== "CANCELLED");
  const approvalHours = decided.map((o) => (o.decidedAt!.getTime() - o.paidAt!.getTime()) / 3_600_000).sort((a, b) => a - b);
  const median = approvalHours.length ? approvalHours[Math.floor(approvalHours.length / 2)] : null;
  const rejected = orders.filter((o) => o.status === "REJECTED");
  const reasons = new Map<string, number>();
  for (const o of rejected) {
    const label = o.rejectionReason ? rejectionReasonLabel[o.rejectionReason] : "Unknown";
    reasons.set(label, (reasons.get(label) ?? 0) + 1);
  }

  const sortDesc = (m: Map<string, number>) => [...m.entries()].sort((a, b) => b[1] - a[1]);
  return {
    orders,
    revenuePaise: approved.reduce((s, o) => s + o.totalPaise - o.refundedPaise, 0),
    approvedCount: approved.length,
    paidCount: orders.length,
    rejectedCount: rejected.length,
    medianApprovalHours: median,
    byDay: [...byDay.entries()],
    byBranch: sortDesc(byBranch),
    byCategory: sortDesc(byCategory),
    byEra: sortDesc(byEra),
    topBrands: sortDesc(byBrand).slice(0, 10),
    topTeams: sortDesc(byTeam).slice(0, 10),
    rejectionReasons: sortDesc(reasons),
  };
}

export function reportRange(sp: Record<string, string | string[] | undefined>) {
  const days = Math.min(365, Math.max(1, Number(typeof sp.days === "string" ? sp.days : 30) || 30));
  const to = new Date();
  const from = new Date(to.getTime() - days * 86_400_000);
  return { days, from, to };
}
