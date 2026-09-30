import Link from "next/link";
import { Suspense } from "react";
import { StatusBadge } from "@/components/order-status";
import type { OrderStatus } from "@/generated/prisma/enums";
import { branchScope, requireAdmin } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { formatINR } from "@/lib/money";
import { formatDateTime, formatDuration, hoursSince } from "@/lib/time";
import { BranchSwitcher } from "../branch-switcher";

const tabs: { status: OrderStatus | "ALL"; label: string }[] = [
  { status: "AWAITING_APPROVAL", label: "Awaiting approval" },
  { status: "CONFIRMED", label: "To pack" },
  { status: "PACKED", label: "Packed" },
  { status: "SHIPPED", label: "Shipped" },
  { status: "READY_FOR_PICKUP", label: "Ready for pickup" },
  { status: "REJECTED", label: "Rejected" },
  { status: "CANCELLED", label: "Cancelled" },
  { status: "ALL", label: "All" },
];

export default async function OrdersPage({ searchParams }: PageProps<"/admin/orders">) {
  const admin = await requireAdmin();
  const sp = await searchParams;
  const status = (typeof sp.status === "string" ? sp.status : "AWAITING_APPROVAL") as OrderStatus | "ALL";
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const scope = branchScope(admin, typeof sp.branch === "string" ? sp.branch : null);

  const orders = await db.order.findMany({
    where: {
      ...scope,
      ...(status === "ALL" ? { status: { not: "PENDING_PAYMENT" } } : { status }),
      ...(q
        ? { OR: [{ number: { contains: q, mode: "insensitive" } }, { customer: { phone: { contains: q.replace(/\D/g, "") || q } } }, { customer: { name: { contains: q, mode: "insensitive" } } }] }
        : {}),
    },
    orderBy: status === "AWAITING_APPROVAL" ? { paidAt: "asc" } : { createdAt: "desc" },
    include: { customer: true, branch: true, items: true, checkout: { include: { payments: { where: { status: "CAPTURED" } } } } },
    take: 100,
  });
  const branches = admin.role === "SUPER_ADMIN" ? await db.branch.findMany({ orderBy: { name: "asc" } }) : [];
  const withParams = (s: string) => {
    const p = new URLSearchParams();
    p.set("status", s);
    if (typeof sp.branch === "string") p.set("branch", sp.branch);
    return `/admin/orders?${p}`;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="display text-5xl">Orders</h1>
        <div className="flex flex-wrap items-end gap-4">
          <form className="flex items-end gap-2">
            <input type="hidden" name="status" value={status} />
            {typeof sp.branch === "string" && <input type="hidden" name="branch" value={sp.branch} />}
            <input name="q" defaultValue={q} placeholder="Order no., phone or name" className="field w-56 py-1 text-sm" aria-label="Search orders" />
          </form>
          {branches.length > 0 && <Suspense><BranchSwitcher branches={branches} /></Suspense>}
        </div>
      </div>

      <nav className="flex gap-1 overflow-x-auto" aria-label="Order status">
        {tabs.map((t) => (
          <Link key={t.status} href={withParams(t.status)} aria-current={status === t.status ? "page" : undefined} className={`label shrink-0 px-3 py-2 ${status === t.status ? "bg-ink text-paper" : "bg-paper hover:bg-mist"}`}>
            {t.label}
          </Link>
        ))}
      </nav>

      <div className="overflow-x-auto bg-paper">
        <table className="w-full min-w-[800px] text-sm">
          <thead>
            <tr className="field-label border-b border-ink text-left">
              <th className="p-3">Order</th>
              <th>Customer</th>
              <th>Items</th>
              {admin.role === "SUPER_ADMIN" && <th>Branch</th>}
              <th className="text-right">Amount</th>
              <th>Payment</th>
              <th>Status</th>
              <th className="pr-3 text-right">{status === "AWAITING_APPROVAL" ? "Waiting" : "Placed"}</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => {
              const waited = hoursSince(o.paidAt);
              return (
                <tr key={o.id} className={`border-b border-mist ${o.status === "AWAITING_APPROVAL" && waited >= 20 ? "bg-ink text-paper" : "hover:bg-bone"}`}>
                  <td className="p-3"><Link href={`/admin/orders/${o.id}`} className="label underline underline-offset-4">{o.number}</Link></td>
                  <td>{o.customer.name}<br /><span className="label text-steel">{o.customer.phone}</span></td>
                  <td>
                    <div className="flex gap-1">
                      {o.items.slice(0, 4).map((i) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img key={i.id} src={i.imageUrl ?? ""} alt={i.title} title={i.title} className="aspect-[4/5] w-8 bg-bone object-cover" />
                      ))}
                    </div>
                  </td>
                  {admin.role === "SUPER_ADMIN" && <td>{o.branch.name}</td>}
                  <td className="label text-right">{formatINR(o.totalPaise)}</td>
                  <td className="label">{o.checkout.payments.length ? `Paid · ${o.checkout.payments[0].method ?? "Razorpay"}` : "—"}</td>
                  <td><StatusBadge status={o.status} /></td>
                  <td className="label pr-3 text-right">{o.status === "AWAITING_APPROVAL" ? formatDuration(waited) : formatDateTime(o.createdAt)}</td>
                </tr>
              );
            })}
            {orders.length === 0 && (
              <tr><td colSpan={8} className="p-8 text-center text-graphite">No orders here.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
