"use client";

import { AlertCircle, Lock } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Script from "next/script";
import { useState } from "react";
import { bag } from "@/lib/bag-store";
import { formatINR } from "@/lib/money";
import { shippingFor } from "@/lib/pricing";
import { groupByBranch, useBagItems } from "@/lib/use-bag-items";

interface CreatedCheckout {
  checkoutId: string;
  accessToken: string;
  razorpayOrderId: string;
  amountPaise: number;
  keyId: string;
  gatewayMode: "razorpay" | "mock";
  customer: { name: string; email: string; phone: string };
}

interface RazorpayResponse {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open(): void; on(event: string, cb: (e: unknown) => void): void };
  }
}

type Fields = Record<string, string[] | undefined>;

function FieldError({ errors, name }: { errors: Fields; name: string }) {
  const msg = errors[name]?.[0];
  if (!msg) return null;
  return (
    <p className="mt-1 flex items-center gap-1 text-sm text-signal" id={`${name}-error`}>
      <AlertCircle className="size-4" strokeWidth={1.5} aria-hidden /> {msg}
    </p>
  );
}

function Input({ name, label, errors, ...props }: { name: string; label: string; errors: Fields } & React.ComponentProps<"input">) {
  return (
    <label className="block">
      <span className="field-label">{label}</span>
      <input name={name} className="field" aria-invalid={!!errors[name]} aria-describedby={errors[name] ? `${name}-error` : undefined} {...props} />
      <FieldError errors={errors} name={name} />
    </label>
  );
}

export default function CheckoutPage() {
  const router = useRouter();
  const { items, loading, empty } = useBagItems();
  const [delivery, setDelivery] = useState<"HOME" | "PICKUP">("HOME");
  const [errors, setErrors] = useState<Fields>({});
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<CreatedCheckout | null>(null);
  const [mockOpen, setMockOpen] = useState(false);

  const groups = groupByBranch(items);
  const pickupPossible = groups.every((g) => g.branch.pickupEnabled);
  const subtotal = items.reduce((s, i) => s + i.pricePaise * i.quantity, 0);
  const shipping = groups.reduce((s, g) => s + shippingFor(delivery, g.items.reduce((t, i) => t + i.pricePaise * i.quantity, 0)), 0);

  async function verify(response: RazorpayResponse, c: CreatedCheckout) {
    setMessage("Confirming your payment…");
    const res = await fetch("/api/checkout/verify", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(response) });
    if (res.ok) {
      bag.clear();
      router.push(`/orders/${c.checkoutId}?t=${encodeURIComponent(c.accessToken)}&placed=1`);
    } else {
      // The webhook will still deliver the order if the payment went through.
      router.push(`/orders/${c.checkoutId}?t=${encodeURIComponent(c.accessToken)}`);
    }
  }

  function openPayment(c: CreatedCheckout) {
    if (c.gatewayMode === "mock") {
      setMockOpen(true);
      return;
    }
    if (!window.Razorpay) {
      setMessage("The payment window didn't load. Check your connection and try again.");
      return;
    }
    const rzp = new window.Razorpay({
      key: c.keyId,
      order_id: c.razorpayOrderId,
      amount: c.amountPaise,
      currency: "INR",
      name: "ThriftSyndicate",
      description: "All sales final",
      image: `${window.location.origin}/icon.svg`,
      prefill: { name: c.customer.name, email: c.customer.email, contact: c.customer.phone },
      theme: { color: "#0A0A0A" },
      handler: (response: RazorpayResponse) => verify(response, c),
      modal: { ondismiss: () => setMessage("Payment not completed. Your items stay reserved for 15 minutes — you can try again.") },
    });
    rzp.on("payment.failed", () => setMessage("The payment failed. You haven't been charged — try again or use another method."));
    rzp.open();
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (created) return openPayment(created);
    const f = new FormData(e.currentTarget);
    const body = {
      items: items.map((i) => ({ variantId: i.variantId, quantity: i.quantity })),
      contact: {
        name: f.get("name"),
        phone: f.get("phone"),
        email: f.get("email"),
        marketingConsent: f.get("marketing") === "on",
      },
      deliveryType: delivery,
      address:
        delivery === "HOME"
          ? { line1: f.get("line1"), line2: f.get("line2") ?? "", city: f.get("city"), state: f.get("state"), pincode: f.get("pincode") }
          : undefined,
      note: f.get("note") ?? "",
      finalSaleAccepted: f.get("finalSale") === "on",
    };

    setBusy(true);
    setErrors({});
    setMessage(null);
    try {
      const res = await fetch("/api/checkout", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) {
        if (data.fields) {
          const flat: Fields = {};
          for (const [k, v] of Object.entries(data.fields as Record<string, unknown>)) flat[k] = v as string[];
          setErrors(flat);
        }
        if (data.code === "ITEMS_UNAVAILABLE") {
          bag.removeMany(data.details?.variantIds ?? []);
        }
        setMessage(data.error ?? "Something went wrong.");
        return;
      }
      setCreated(data);
      openPayment(data);
    } finally {
      setBusy(false);
    }
  }

  if (empty) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-24 text-center">
        <h1 className="display text-6xl">Nothing to check out</h1>
        <Link href="/shop" className="btn btn-primary mt-8">Shop the drop</Link>
      </div>
    );
  }

  // Server-side validation returns nested paths flattened by Zod (contact, address). Map them to inputs.
  const fieldErrors: Fields = { ...errors };

  return (
    <div className="mx-auto max-w-[1200px] px-4 py-10 md:px-8">
      <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="lazyOnload" />
      <h1 className="display border-b border-ink pb-4 text-5xl md:text-7xl">Checkout</h1>

      <form onSubmit={onSubmit} className="mt-8 grid gap-12 lg:grid-cols-[1fr_380px]" noValidate>
        <fieldset disabled={!!created} className="space-y-12">
          <section className="space-y-5">
            <h2 className="display text-3xl"><span className="label mr-3 align-middle text-steel">01</span>Contact</h2>
            <Input name="name" label="Full name" autoComplete="name" required errors={fieldErrors} />
            <div className="grid gap-5 md:grid-cols-2">
              <Input name="phone" label="Mobile number" type="tel" inputMode="tel" autoComplete="tel-national" placeholder="98765 43210" required errors={fieldErrors} />
              <Input name="email" label="Email" type="email" autoComplete="email" required errors={fieldErrors} />
            </div>
            {fieldErrors.contact && <FieldError errors={fieldErrors} name="contact" />}
            <label className="flex items-start gap-2 text-sm text-graphite">
              <input type="checkbox" name="marketing" className="mt-1 size-4 accent-ink" />
              Tell me about new drops by WhatsApp and email. You can opt out any time.
            </label>
          </section>

          <section className="space-y-5">
            <h2 className="display text-3xl"><span className="label mr-3 align-middle text-steel">02</span>Delivery</h2>
            <div className="grid gap-3 md:grid-cols-2" role="radiogroup" aria-label="Delivery method">
              {[
                { v: "HOME" as const, t: "Home delivery", d: "Courier across India" },
                { v: "PICKUP" as const, t: "Pick up at store", d: pickupPossible ? "Free · collect with a code" : "Not available for this bag" },
              ].map((o) => (
                <label key={o.v} className={`cursor-pointer border p-4 ${delivery === o.v ? "border-ink" : "border-mist"} ${o.v === "PICKUP" && !pickupPossible ? "opacity-40" : ""}`}>
                  <input type="radio" name="delivery" value={o.v} checked={delivery === o.v} disabled={o.v === "PICKUP" && !pickupPossible} onChange={() => setDelivery(o.v)} className="sr-only" />
                  <span className="block font-medium">{o.t}</span>
                  <span className="label text-steel">{o.d}</span>
                </label>
              ))}
            </div>
            {delivery === "HOME" ? (
              <div className="space-y-5">
                <Input name="line1" label="Address" autoComplete="address-line1" required errors={fieldErrors} />
                <Input name="line2" label="Apartment, landmark (optional)" autoComplete="address-line2" errors={fieldErrors} />
                <div className="grid gap-5 md:grid-cols-3">
                  <Input name="city" label="City" autoComplete="address-level2" required errors={fieldErrors} />
                  <Input name="state" label="State" autoComplete="address-level1" required errors={fieldErrors} />
                  <Input name="pincode" label="PIN code" inputMode="numeric" autoComplete="postal-code" maxLength={6} required errors={fieldErrors} />
                </div>
                <FieldError errors={fieldErrors} name="address" />
              </div>
            ) : (
              <ul className="space-y-2 text-sm">
                {groups.map((g) => (
                  <li key={g.branch.id}>Collect from <strong>{g.branch.name}</strong> once the store says it&apos;s ready.</li>
                ))}
              </ul>
            )}
            <label className="block">
              <span className="field-label">Note for the store (optional)</span>
              <textarea name="note" rows={2} maxLength={500} className="box mt-1" />
            </label>
          </section>
        </fieldset>

        <aside className="h-fit space-y-5 bg-bone p-6 lg:sticky lg:top-24">
          <h2 className="display text-3xl"><span className="label mr-3 align-middle text-steel">03</span>Review & pay</h2>
          <ul className="space-y-3">
            {items.map((i) => (
              <li key={i.variantId} className="flex justify-between gap-3 text-sm">
                <span>{i.title} <span className="label text-steel">· {i.size}{i.quantity > 1 ? ` × ${i.quantity}` : ""}</span></span>
                <span className="label shrink-0">{formatINR(i.pricePaise * i.quantity)}</span>
              </li>
            ))}
          </ul>
          <dl className="space-y-2 border-t border-ash pt-3 text-sm">
            <div className="flex justify-between"><dt>Subtotal</dt><dd>{formatINR(subtotal)}</dd></div>
            <div className="flex justify-between"><dt>Shipping{groups.length > 1 ? ` (${groups.length} parcels)` : ""}</dt><dd>{shipping === 0 ? "Free" : formatINR(shipping)}</dd></div>
            <div className="flex justify-between text-base font-medium"><dt>Total incl. GST</dt><dd>{formatINR(created?.amountPaise ?? subtotal + shipping)}</dd></div>
          </dl>

          <label className="flex items-start gap-3 border border-ink bg-paper p-3 text-sm">
            <input type="checkbox" name="finalSale" required disabled={!!created} className="mt-0.5 size-4 shrink-0 accent-ink" aria-invalid={!!fieldErrors.finalSaleAccepted} />
            <span>
              <strong>I understand all sales are final.</strong> There are no returns, exchanges or replacements. I&apos;ve checked the photos, condition and measurements.
            </span>
          </label>
          <FieldError errors={fieldErrors} name="finalSaleAccepted" />

          {message && (
            <p className="flex gap-2 text-sm" role="status">
              <AlertCircle className="mt-0.5 size-4 shrink-0" strokeWidth={1.5} aria-hidden /> {message}
            </p>
          )}

          <button type="submit" disabled={busy || loading || items.length === 0} className="btn btn-primary w-full">
            <Lock className="size-4" strokeWidth={1.5} aria-hidden />
            {busy ? "Reserving your items…" : created ? "Try payment again" : `Pay ${formatINR(subtotal + shipping)}`}
          </button>
          <p className="text-xs text-steel">
            Secure payment by Razorpay: UPI, cards, net banking, wallets. Your items are held for 15 minutes once you click Pay. The store confirms your order after payment; if it can&apos;t, you get a full refund.
          </p>
        </aside>
      </form>

      {mockOpen && created && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-ink/70 p-4" role="dialog" aria-modal="true" aria-labelledby="mock-title">
          <div className="w-full max-w-sm bg-paper p-6">
            <p className="label text-steel">Development only</p>
            <h2 id="mock-title" className="display mt-1 text-3xl">Mock Razorpay</h2>
            <p className="mt-2 text-sm text-graphite">No Razorpay keys are set, so this stands in for the payment window. Amount {formatINR(created.amountPaise)}.</p>
            <div className="mt-6 grid gap-2">
              <button
                className="btn btn-primary"
                onClick={async () => {
                  setMockOpen(false);
                  const res = await fetch("/api/dev/mock-pay", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ orderId: created.razorpayOrderId }) });
                  await verify(await res.json(), created);
                }}
              >
                Pay with UPI (succeeds)
              </button>
              <button
                className="btn btn-secondary"
                onClick={() => {
                  setMockOpen(false);
                  setMessage("Payment not completed. Your items stay reserved for 15 minutes — you can try again.");
                }}
              >
                Close without paying
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
