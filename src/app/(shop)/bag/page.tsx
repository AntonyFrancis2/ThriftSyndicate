"use client";

import { AlertCircle, X } from "lucide-react";
import Link from "next/link";
import { bag } from "@/lib/bag-store";
import { formatINR } from "@/lib/money";
import { shippingFor } from "@/lib/pricing";
import { groupByBranch, useBagItems } from "@/lib/use-bag-items";
import { photoUrl } from "@/lib/photo-url";

export default function BagPage() {
  const { items, loading, empty } = useBagItems();
  const groups = groupByBranch(items);
  const unavailable = items.filter((i) => i.available < i.quantity);
  const subtotal = items.reduce((s, i) => s + i.pricePaise * i.quantity, 0);
  const shipping = groups.reduce((s, g) => s + shippingFor("HOME", g.items.reduce((t, i) => t + i.pricePaise * i.quantity, 0)), 0);

  if (empty) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-24 text-center">
        <h1 className="display text-6xl">Your bag is empty</h1>
        <p className="mt-4 text-graphite">One piece, one owner. Find yours before someone else does.</p>
        <Link href="/shop" className="btn btn-primary mt-8">Shop the drop</Link>
      </div>
    );
  }

  return (
    <div className="mx-auto grid max-w-[1200px] gap-12 px-4 py-10 md:px-8 lg:grid-cols-[1fr_360px]">
      <div>
        <h1 className="display border-b border-ink pb-4 text-5xl md:text-7xl">Bag</h1>
        {groups.length > 1 && (
          <p className="mt-4 bg-bone p-3 text-sm">
            Your bag ships as <strong>{groups.length} parcels</strong>, one from each store. You pay once; each store confirms its own parcel.
          </p>
        )}
        {loading && items.length === 0 && <p className="label mt-8 text-steel">Loading…</p>}
        {groups.map((g) => (
          <section key={g.branch.id} className="mt-8">
            <h2 className="label mb-2 text-steel">Ships from {g.branch.name}</h2>
            <ul className="divide-y divide-mist border-y border-mist">
              {g.items.map((i) => (
                <li key={i.variantId} className="flex gap-4 py-4">
                  <Link href={`/product/${i.slug}`} className="w-24 shrink-0 bg-bone">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {i.imageUrl && <img src={photoUrl(i.imageUrl, 240)} alt="" className="aspect-[4/5] w-full object-cover" />}
                  </Link>
                  <div className="flex flex-1 flex-col">
                    <div className="flex justify-between gap-3">
                      <Link href={`/product/${i.slug}`} className="font-medium hover:underline">{i.title}</Link>
                      <button onClick={() => bag.remove(i.variantId)} aria-label={`Remove ${i.title}`} className="p-1">
                        <X className="size-4" strokeWidth={1.5} />
                      </button>
                    </div>
                    <p className="label mt-1 text-steel">Size {i.size} · {i.era === "RETRO" ? "Retro" : "Latest"}{i.quantity > 1 ? ` · Qty ${i.quantity}` : ""}</p>
                    <p className="label mt-auto">{formatINR(i.pricePaise * i.quantity)}</p>
                    {i.available < i.quantity && (
                      <p className="mt-2 flex items-center gap-2 text-sm text-signal" role="alert">
                        <AlertCircle className="size-4" strokeWidth={1.5} aria-hidden />
                        {i.available === 0 ? "Just sold or on hold for another shopper." : `Only ${i.available} left.`}
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <aside className="h-fit space-y-4 bg-bone p-6 lg:sticky lg:top-24">
        <h2 className="display text-3xl">Summary</h2>
        <dl className="space-y-2 text-sm">
          <div className="flex justify-between"><dt>Subtotal</dt><dd>{formatINR(subtotal)}</dd></div>
          <div className="flex justify-between"><dt>Shipping</dt><dd>{shipping === 0 ? "Free" : formatINR(shipping)}</dd></div>
          <div className="flex justify-between border-t border-ash pt-2 text-base font-medium"><dt>Total incl. GST</dt><dd>{formatINR(subtotal + shipping)}</dd></div>
        </dl>
        <p className="label text-steel">Free pickup at the store is available at checkout.</p>
        <p className="tag w-full border-ink py-2 text-center">All sales final — no returns or exchanges</p>
        {unavailable.length > 0 ? (
          <button className="btn btn-secondary w-full" onClick={() => bag.removeMany(unavailable.map((i) => i.variantId))}>
            Remove unavailable items
          </button>
        ) : (
          <Link href="/checkout" className={`btn btn-primary w-full ${loading ? "pointer-events-none opacity-40" : ""}`}>
            Checkout
          </Link>
        )}
        <p className="text-xs text-steel">Items aren&apos;t held in your bag. They&apos;re reserved for 15 minutes once you click Pay.</p>
      </aside>
    </div>
  );
}
