import Link from "next/link";
import { notFound } from "next/navigation";
import { StatusBadge } from "@/components/order-status";
import { requireAdmin } from "@/lib/auth/session";
import { storeConfig } from "@/lib/config";
import { db } from "@/lib/db";
import { formatINR } from "@/lib/money";
import { nextFulfilmentStatus, rejectionReasonLabel } from "@/lib/orders/status";
import { formatDateTime, formatDuration, hoursSince } from "@/lib/time";
import { ApprovalPanel, FulfilmentForm, RejectForm } from "./decision-panel";

export default async function AdminOrderPage({ params, searchParams }: PageProps<"/admin/orders/[id]">) {
  const admin = await requireAdmin();
  const notice = (await searchParams).notice;
  const order = await db.order.findUnique({
    where: { id: (await params).id },
    include: {
      customer: true,
      branch: true,
      approvedBy: true,
      items: { include: { variant: { include: { product: true } } } },
      events: { orderBy: { createdAt: "asc" } },
      refunds: { orderBy: { createdAt: "asc" }, include: { createdBy: true } },
      checkout: { include: { payments: true, orders: { select: { id: true, number: true } } } },
    },
  });
  if (!order || (admin.role === "BRANCH_ADMIN" && order.branchId !== admin.branchId)) notFound();

  const payment = order.checkout.payments.find((p) => p.status === "CAPTURED");
  const address = order.address as { line1: string; line2?: string; city: string; state: string; pincode: string } | null;
  const next = nextFulfilmentStatus(order.status, order.deliveryType);
  const waited = hoursSince(order.paidAt);
  const siblings = order.checkout.orders.filter((o) => o.id !== order.id);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/orders" className="label text-steel hover:underline">← Orders</Link>
        <div className="mt-2 flex flex-wrap items-center gap-4">
          <h1 className="display text-5xl">{order.number}</h1>
          <StatusBadge status={order.status} />
        </div>
        <p className="label mt-2 text-steel">
          {order.branch.name} · Placed {formatDateTime(order.createdAt)}
          {order.status === "AWAITING_APPROVAL" && ` · Waiting ${formatDuration(waited)} (auto-reject at ${storeConfig.approvalDeadlineHours}h)`}
        </p>
        {siblings.length > 0 && (
          <p className="mt-2 text-sm">Same payment also covers {siblings.map((s) => <Link key={s.id} href={`/admin/orders/${s.id}`} className="label underline">{s.number}</Link>)} from the other store.</p>
        )}
      </div>

      {notice === "approved" && order.status !== "AWAITING_APPROVAL" && (
        <p className="bg-ink p-4 text-paper" role="status">Approved. The customer has been told their order is being packed.</p>
      )}
      {notice === "rejected" && order.status === "REJECTED" && (
        <p className="bg-ink p-4 text-paper" role="status">
          Rejected. {order.refunds.some((r) => r.status === "FAILED") ? "The refund failed — retry it from Payments." : `A full refund of ${formatINR(order.totalPaise)} has been issued and the customer told.`}
        </p>
      )}

      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          {order.status === "AWAITING_APPROVAL" ? (
            <ApprovalPanel
              orderId={order.id}
              items={order.items.map((i) => ({ id: i.id, title: i.title, size: i.size, sku: i.variant.product.sku, rackLocation: i.variant.product.rackLocation, imageUrl: i.imageUrl, foundOnRack: i.foundOnRack }))}
            />
          ) : (
            <section className="bg-paper p-5">
              <h2 className="display mb-3 text-3xl">Items</h2>
              <ul className="divide-y divide-mist">
                {order.items.map((i) => (
                  <li key={i.id} className="flex items-center gap-4 py-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={i.imageUrl ?? ""} alt="" className="aspect-[4/5] w-12 bg-bone object-cover" />
                    <span className="flex-1">{i.title} <span className="label text-steel">· {i.size} · {i.variant.product.sku} · Rack {i.variant.product.rackLocation ?? "—"}</span></span>
                    <span className="label">{formatINR(i.pricePaise * i.quantity)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="grid gap-6 bg-paper p-5 md:grid-cols-2">
            <div>
              <h2 className="field-label mb-2">Customer</h2>
              <p>{order.customer.name}</p>
              <p className="text-graphite">{order.customer.phone}<br />{order.customer.email}</p>
              {order.customer.blocked && <p className="label mt-1 text-signal">Blocked customer</p>}
            </div>
            <div>
              <h2 className="field-label mb-2">{order.deliveryType === "PICKUP" ? "Pickup" : "Deliver to"}</h2>
              {order.deliveryType === "PICKUP" || !address ? (
                <p>Collect at {order.branch.name}</p>
              ) : (
                <p>{address.line1}{address.line2 ? `, ${address.line2}` : ""}<br />{address.city}, {address.state} {address.pincode}</p>
              )}
              {order.customerNote && <p className="mt-2 border-l-2 border-ink pl-3 text-sm">“{order.customerNote}”</p>}
            </div>
          </section>

          <section className="bg-paper p-5">
            <h2 className="field-label mb-2">Payment</h2>
            {payment ? (
              <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-sm">
                <dt className="text-steel">Razorpay payment</dt><dd className="label">{payment.razorpayPaymentId}</dd>
                <dt className="text-steel">Razorpay order</dt><dd className="label">{payment.razorpayOrderId}</dd>
                <dt className="text-steel">Method</dt><dd>{payment.method?.toUpperCase() ?? "—"}</dd>
                <dt className="text-steel">Paid (whole checkout)</dt><dd>{formatINR(payment.amountPaise)}</dd>
                <dt className="text-steel">This order</dt><dd>{formatINR(order.totalPaise)} <span className="label text-steel">incl. {formatINR(order.shippingPaise)} shipping, {formatINR(order.taxPaise)} GST</span></dd>
              </dl>
            ) : (
              <p className="text-graphite">No captured payment.</p>
            )}
            {order.refunds.length > 0 && (
              <ul className="mt-4 space-y-1 border-t border-mist pt-3 text-sm">
                {order.refunds.map((r) => (
                  <li key={r.id} className={r.status === "FAILED" ? "text-signal" : ""}>
                    Refund {formatINR(r.amountPaise)} · {r.status.toLowerCase()} · {r.reason} · {r.createdBy?.name ?? "System"} · {formatDateTime(r.createdAt)}
                    {r.razorpayRefundId && <span className="label text-steel"> · {r.razorpayRefundId}</span>}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="bg-paper p-5">
            <h2 className="field-label mb-3">History</h2>
            <ol className="space-y-2 text-sm">
              {order.events.map((e) => (
                <li key={e.id}><span className="label mr-3 text-steel">{formatDateTime(e.createdAt)}</span>{e.message}</li>
              ))}
            </ol>
            {order.approvedBy && <p className="label mt-3 text-steel">Approved by {order.approvedBy.name}</p>}
            {order.rejectionReason && <p className="label mt-3 text-steel">Rejected: {rejectionReasonLabel[order.rejectionReason]}{order.rejectionNote ? ` — ${order.rejectionNote}` : ""}</p>}
          </section>
        </div>

        <div className="space-y-6">
          {order.status === "AWAITING_APPROVAL" && <RejectForm orderId={order.id} amount={formatINR(order.totalPaise)} />}
          {next && <FulfilmentForm orderId={order.id} next={next} />}
          {order.status === "SHIPPED" && order.awb && (
            <p className="bg-paper p-5 text-sm">{order.courier} · AWB <span className="label">{order.awb}</span></p>
          )}
          {!["AWAITING_APPROVAL", "PENDING_PAYMENT", "REJECTED", "CANCELLED", "EXPIRED"].includes(order.status) && (
            <div className="grid grid-cols-2 gap-3">
              <Link href={`/admin/print/${order.id}?doc=packing-slip`} target="_blank" className="btn btn-secondary">Packing slip</Link>
              <Link href={`/admin/print/${order.id}?doc=invoice`} target="_blank" className="btn btn-secondary">GST invoice</Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
