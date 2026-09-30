import Link from "next/link";
import { Suspense } from "react";
import { branchScope, requireAdmin } from "@/lib/auth/session";
import { storeConfig } from "@/lib/config";
import { db } from "@/lib/db";
import { formatINR } from "@/lib/money";
import { formatDuration, hoursSince, startOfTodayIST } from "@/lib/time";
import { BranchSwitcher } from "./branch-switcher";

export default async function DashboardPage({ searchParams }: PageProps<"/admin">) {
  const admin = await requireAdmin();
  const branchParam = (await searchParams).branch;
  const scope = branchScope(admin, typeof branchParam === "string" ? branchParam : null);
  const today = startOfTodayIST();

  const [awaiting, toPack, toShip, revenue, branches] = await Promise.all([
    db.order.findMany({ where: { ...scope, status: "AWAITING_APPROVAL" }, orderBy: { paidAt: "asc" }, include: { customer: true, branch: true, items: true } }),
    db.order.count({ where: { ...scope, status: "CONFIRMED" } }),
    db.order.count({ where: { ...scope, status: "PACKED" } }),
    db.order.aggregate({
      where: { ...scope, paidAt: { gte: today }, status: { notIn: ["REJECTED", "CANCELLED", "EXPIRED", "PENDING_PAYMENT"] } },
      _sum: { totalPaise: true },
      _count: true,
    }),
    admin.role === "SUPER_ADMIN" ? db.branch.findMany({ orderBy: { name: "asc" } }) : Promise.resolve([]),
  ]);
  const oldest = awaiting[0] ? hoursSince(awaiting[0].paidAt) : 0;

  const cards = [
    { label: "Awaiting approval", value: awaiting.length, sub: awaiting.length ? `Oldest ${formatDuration(oldest)}` : "All clear", href: "/admin/orders?status=AWAITING_APPROVAL", urgent: oldest >= storeConfig.approvalAlertHours - 4 },
    { label: "To pack", value: toPack, sub: "Confirmed", href: "/admin/orders?status=CONFIRMED" },
    { label: "To ship / hand over", value: toShip, sub: "Packed", href: "/admin/orders?status=PACKED" },
    { label: "Today's revenue", value: formatINR(revenue._sum.totalPaise ?? 0), sub: `${revenue._count} paid order${revenue._count === 1 ? "" : "s"}`, href: "/admin/reports" },
  ];

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="display text-5xl">Dashboard</h1>
        {branches.length > 0 && <Suspense><BranchSwitcher branches={branches} /></Suspense>}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map((c) => (
          <Link key={c.label} href={c.href} className={`p-5 ${c.urgent ? "bg-ink text-paper" : "bg-paper"}`}>
            <p className="field-label">{c.label}</p>
            <p className="display mt-2 text-5xl">{c.value}</p>
            <p className={`label mt-1 ${c.urgent ? "text-ash" : "text-steel"}`}>{c.sub}</p>
          </Link>
        ))}
      </div>

      <section>
        <h2 className="display mb-3 text-3xl">Approval queue</h2>
        {awaiting.length === 0 ? (
          <p className="bg-paper p-6 text-graphite">No orders waiting. Nice.</p>
        ) : (
          <ul className="divide-y divide-mist bg-paper">
            {awaiting.map((o) => {
              const waited = hoursSince(o.paidAt);
              const left = storeConfig.approvalAlertHours - waited;
              const urgent = left <= 4;
              return (
                <li key={o.id}>
                  <Link href={`/admin/orders/${o.id}`} className={`flex flex-wrap items-center gap-x-6 gap-y-1 p-4 ${urgent ? "bg-ink text-paper" : "hover:bg-bone"}`}>
                    <span className="label w-44">{o.number}</span>
                    <span className="flex-1">{o.customer.name} · {o.items.length} item{o.items.length === 1 ? "" : "s"}{admin.role === "SUPER_ADMIN" ? ` · ${o.branch.name}` : ""}</span>
                    <span className="label">{formatINR(o.totalPaise)}</span>
                    <span className="label w-40 text-right">
                      {left > 0 ? `${formatDuration(left)} to 24h target` : `Overdue by ${formatDuration(-left)}`}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
        <p className="label mt-2 text-steel">
          Target: decide within {storeConfig.approvalAlertHours}h. Undecided orders auto-reject with a full refund at {storeConfig.approvalDeadlineHours}h.
        </p>
      </section>
    </div>
  );
}
