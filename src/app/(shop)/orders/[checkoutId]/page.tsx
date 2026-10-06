import { CheckCircle2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ConfirmButton } from "@/components/confirm-button";
import { StatusBadge } from "@/components/order-status";
import { storeConfig } from "@/lib/config";
import { formatINR } from "@/lib/money";
import { getCheckoutForCustomer } from "@/lib/orders/queries";
import { rejectionReasonLabel } from "@/lib/orders/status";
import { cancelOrderAction } from "../actions";

export const metadata: Metadata = { title: "Your order", robots: { index: false } };

const refundTimeline = storeConfig.instantRefunds ? "usually within minutes" : "in 5–7 working days";

export default async function OrderPage({ params, searchParams }: PageProps<"/orders/[checkoutId]">) {
  const { checkoutId } = await params;
  const sp = await searchParams;
  const token = typeof sp.t === "string" ? sp.t : undefined;
  const checkout = await getCheckoutForCustomer(checkoutId, token);
  if (!checkout) notFound();

  const paid = checkout.status === "PAID";
  const payment = checkout.payments[0];

  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      {sp.placed && paid && (
        <div className="mb-10 bg-positive p-6 text-ink">
          <CheckCircle2 className="size-8" strokeWidth={1.5} aria-hidden />
          <h1 className="display mt-4 text-5xl">Order placed</h1>
          <p className="mt-2 text-graphite">
            Awaiting confirmation from our store. We check every piece is on the rack and as described, usually within a few hours
            (always within {storeConfig.approvalAlertHours} hours). If we can&apos;t confirm it, you get a full refund automatically.
          </p>
        </div>
      )}
      {!paid && checkout.status === "PENDING_PAYMENT" && (
        <div className="mb-10 border border-ink p-6">
          <h1 className="display text-4xl">Waiting for payment confirmation</h1>
          <p className="mt-2 text-graphite">If you completed the payment, this page updates within a minute. Refresh to check.</p>
        </div>
      )}
      {!paid && checkout.status !== "PENDING_PAYMENT" && (
        <div className="mb-10 border border-mist p-6">
          <h1 className="display text-4xl">Payment not completed</h1>
          <p className="mt-2 text-graphite">No money was taken. The items went back on the rack.</p>
          <Link href="/shop" className="btn btn-primary mt-4">Back to the shop</Link>
        </div>
      )}
      {sp.cancelled && <p className="mb-6 border border-ink p-4 text-sm" role="status">Order cancelled. Your full refund is on its way, {refundTimeline}.</p>}
      {typeof sp.error === "string" && <p className="mb-6 border border-signal p-4 text-sm text-signal" role="alert">{sp.error}</p>}

      <p className="label text-steel">
        {checkout.customer.name} · {checkout.customer.phone}
        {payment && ` · Paid ${formatINR(payment.amountPaise)} via ${payment.method?.toUpperCase() ?? "Razorpay"}`}
      </p>
      {checkout.orders.length > 1 && <p className="mt-2 text-sm text-graphite">Your bag ships as {checkout.orders.length} parcels, one from each store.</p>}

      {checkout.orders.map((order) => {
        const refunded = order.refunds.filter((r) => r.status !== "FAILED");
        return (
          <section key={order.id} className="mt-10 border-t border-ink pt-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="display text-3xl">{order.number}</h2>
                <p className="label text-steel">Ships from {order.branch.name}</p>
              </div>
              <StatusBadge status={order.status} />
            </div>

            <ul className="mt-6 divide-y divide-mist border-y border-mist">
              {order.items.map((i) => (
                <li key={i.id} className="flex gap-4 py-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {i.imageUrl && <img src={i.imageUrl} alt="" className="aspect-[4/5] w-16 bg-bone object-cover" />}
                  <div className="flex-1 text-sm">
                    <p>{i.title}</p>
                    <p className="label text-steel">Size {i.size}{i.quantity > 1 ? ` × ${i.quantity}` : ""}</p>
                  </div>
                  <span className="label">{formatINR(i.pricePaise * i.quantity)}</span>
                </li>
              ))}
            </ul>
            <dl className="mt-3 space-y-1 text-sm">
              <div className="flex justify-between"><dt>Shipping</dt><dd>{order.shippingPaise ? formatINR(order.shippingPaise) : "Free"}</dd></div>
              <div className="flex justify-between font-medium"><dt>Total incl. GST</dt><dd>{formatINR(order.totalPaise)}</dd></div>
            </dl>

            {order.status === "SHIPPED" && order.awb && (
              <p className="mt-4 text-sm">
                {order.courier} · AWB <span className="label">{order.awb}</span>
                {order.trackingUrl && (
                  <> · <a href={order.trackingUrl} className="underline underline-offset-4" target="_blank" rel="noopener noreferrer">Track parcel</a></>
                )}
              </p>
            )}
            {order.status === "READY_FOR_PICKUP" && order.pickupOtp && (
              <div className="mt-4 bg-bone p-4">
                <p className="label text-steel">Pickup code — show this at the counter</p>
                <p className="display mt-1 text-5xl tracking-widest">{order.pickupOtp}</p>
                <p className="mt-1 text-sm">{order.branch.name}: {order.branch.address}, {order.branch.city} · {order.branch.hours}</p>
              </div>
            )}
            {(order.status === "REJECTED" || order.status === "CANCELLED") && (
              <div className="mt-4 bg-bone p-4 text-sm">
                {order.status === "REJECTED" && order.rejectionReason && (
                  <p>We couldn&apos;t confirm this order: {rejectionReasonLabel[order.rejectionReason].toLowerCase()}. Sorry about that.</p>
                )}
                {refunded.map((r) => (
                  <p key={r.id} className="mt-1">
                    Refund of {formatINR(r.amountPaise)}: {r.status === "PROCESSED" ? "processed" : "on its way"} ({refundTimeline})
                    {r.razorpayRefundId && <span className="label text-steel"> · Ref {r.razorpayRefundId}</span>}
                  </p>
                ))}
                {refunded.length === 0 && <p className="mt-1">Your full refund is being arranged. We&apos;ll message you with the reference.</p>}
              </div>
            )}

            <ol className="mt-6 space-y-3 border-l border-primary pl-5">
              {order.events.map((e) => (
                <li key={e.id} className="relative text-sm">
                  <span className="absolute -left-[25px] top-1.5 size-2 rounded-full bg-primary" aria-hidden />
                  <span className="label mr-2 text-steel">
                    {e.createdAt.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" })}
                  </span>
                  {e.message}
                </li>
              ))}
            </ol>

            <div className="mt-6 flex flex-wrap gap-3">
              {paid && !["REJECTED", "CANCELLED", "EXPIRED"].includes(order.status) && (
                <Link href={`/invoice/${order.id}?t=${encodeURIComponent(token!)}`} className="btn btn-secondary" target="_blank">
                  GST invoice
                </Link>
              )}
              {order.status === "AWAITING_APPROVAL" && (
                <form action={cancelOrderAction}>
                  <input type="hidden" name="orderId" value={order.id} />
                  <input type="hidden" name="checkoutId" value={checkout.id} />
                  <input type="hidden" name="token" value={token} />
                  <ConfirmButton className="btn btn-secondary" message="Cancel this order? You'll get a full refund.">Cancel and refund</ConfirmButton>
                </form>
              )}
            </div>
            {order.status === "AWAITING_APPROVAL" && (
              <p className="mt-2 text-xs text-steel">You can cancel for a full refund until the store confirms. After that, all sales are final.</p>
            )}
          </section>
        );
      })}
      <p className="mt-12 text-xs text-steel">Bookmark this page — the link is private to you.</p>
    </div>
  );
}
