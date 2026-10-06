import Link from "next/link";
import { requireAdmin } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { formatINR } from "@/lib/money";
import { refundOrder } from "@/lib/orders/refunds";
import { revalidatePath } from "next/cache";
import { formatDateTime } from "@/lib/time";

async function retryRefund(formData: FormData) {
  "use server";
  const admin = await requireAdmin();
  if (admin.role !== "SUPER_ADMIN") return;
  const orderId = String(formData.get("orderId"));
  await refundOrder({ orderId, reason: "Retry of failed refund", adminId: admin.id });
  revalidatePath("/admin/payments");
}

// Payments and refunds (PRD §7.6). Branch admins see payments that include their branch's orders.
export default async function PaymentsPage() {
  const admin = await requireAdmin();
  const branchFilter = admin.role === "BRANCH_ADMIN" ? { checkout: { orders: { some: { branchId: admin.branchId! } } } } : {};
  const [payments, refunds] = await Promise.all([
    db.payment.findMany({
      where: branchFilter,
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { checkout: { include: { customer: true, orders: { select: { id: true, number: true } } } } },
    }),
    db.refund.findMany({
      where: admin.role === "BRANCH_ADMIN" ? { order: { branchId: admin.branchId! } } : {},
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { order: true, createdBy: true, payment: true },
    }),
  ]);
  const dashboard = (id: string) => `https://dashboard.razorpay.com/app/payments/${id}`;

  return (
    <div className="space-y-10">
      <h1 className="display text-5xl">Payments</h1>
      <section className="overflow-x-auto bg-paper">
        <table className="w-full min-w-[800px] text-sm">
          <thead>
            <tr className="field-label border-b border-ink text-left">
              <th className="p-3">Razorpay payment</th><th>Customer</th><th>Orders</th><th>Method</th><th className="text-right">Amount</th><th className="text-right">Fee</th><th>Status</th><th className="pr-3">When</th>
            </tr>
          </thead>
          <tbody>
            {payments.map((p) => (
              <tr key={p.id} className="border-b border-mist">
                <td className="label p-3"><a href={dashboard(p.razorpayPaymentId)} target="_blank" rel="noopener noreferrer" className="underline">{p.razorpayPaymentId}</a></td>
                <td>{p.checkout.customer.name}</td>
                <td className="label">{p.checkout.orders.map((o) => <Link key={o.id} href={`/admin/orders/${o.id}`} className="mr-2 underline">{o.number}</Link>)}</td>
                <td className="label">{p.method ?? "—"}</td>
                <td className="label text-right">{formatINR(p.amountPaise)}</td>
                <td className="label text-right">{p.feePaise != null ? formatINR(p.feePaise) : "—"}</td>
                <td><span className="tag">{p.status.toLowerCase()}</span></td>
                <td className="label pr-3">{formatDateTime(p.createdAt)}</td>
              </tr>
            ))}
            {payments.length === 0 && <tr><td colSpan={8} className="p-8 text-center text-graphite">No payments yet.</td></tr>}
          </tbody>
        </table>
      </section>

      <section>
        <h2 className="display mb-3 text-3xl">Refunds</h2>
        <div className="overflow-x-auto bg-paper">
          <table className="w-full min-w-[800px] text-sm">
            <thead>
              <tr className="field-label border-b border-ink text-left">
                <th className="p-3">Order</th><th className="text-right">Amount</th><th>Reason</th><th>By</th><th>Status</th><th>Razorpay ref</th><th className="pr-3">When</th>
              </tr>
            </thead>
            <tbody>
              {refunds.map((r) => (
                <tr key={r.id} className={`border-b border-mist ${r.status === "FAILED" ? "text-signal" : ""}`}>
                  <td className="label p-3"><Link href={`/admin/orders/${r.orderId}`} className="underline">{r.order.number}</Link></td>
                  <td className="label text-right">{formatINR(r.amountPaise)}</td>
                  <td>{r.reason}</td>
                  <td>{r.createdBy?.name ?? "System"}</td>
                  <td>
                    <span className="tag">{r.status.toLowerCase()}</span>
                    {r.status === "FAILED" && admin.role === "SUPER_ADMIN" && r.order.refundedPaise < r.order.totalPaise && (
                      <form action={retryRefund} className="mt-1 inline-block pl-2">
                        <input type="hidden" name="orderId" value={r.orderId} />
                        <button className="label underline">Retry</button>
                      </form>
                    )}
                  </td>
                  <td className="label">{r.razorpayRefundId ?? "—"}</td>
                  <td className="label pr-3">{formatDateTime(r.createdAt)}</td>
                </tr>
              ))}
              {refunds.length === 0 && <tr><td colSpan={7} className="p-8 text-center text-graphite">No refunds.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
