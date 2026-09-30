import type { Category } from "@/generated/prisma/enums";
import { Logo } from "@/components/logo";
import { formatINR, gstRateForItem, includedGst } from "@/lib/money";

// HSN codes for the three product lines. Confirm with the store's accountant before launch.
const hsn: Record<Category, string> = { TSHIRT: "6109", JEANS: "6203", JERSEY: "6109" };

interface InvoiceProps {
  kind: "invoice" | "packing-slip";
  order: {
    number: string;
    paidAt: Date | null;
    deliveryType: "HOME" | "PICKUP";
    address: unknown;
    shippingPaise: number;
    totalPaise: number;
    customerNote: string;
    branch: { name: string; address: string; city: string; state: string; pincode: string; gstin: string | null; phone: string };
    customer: { name: string; phone: string; email: string };
    items: { id: string; title: string; size: string; pricePaise: number; quantity: number; status: string; category?: Category; rackLocation?: string | null; sku?: string }[];
  };
}

export function Invoice({ kind, order }: InvoiceProps) {
  const addr = order.address as { line1: string; line2?: string; city: string; state: string; pincode: string } | null;
  const placeOfSupply = addr?.state ?? order.branch.state;
  const intraState = placeOfSupply.trim().toLowerCase() === order.branch.state.trim().toLowerCase();
  const items = order.items.filter((i) => i.status === "ACTIVE");
  const rows = items.map((i) => {
    const rate = gstRateForItem(i.pricePaise);
    const gross = i.pricePaise * i.quantity;
    const tax = includedGst(i.pricePaise, rate) * i.quantity;
    return { ...i, rate, gross, tax, taxable: gross - tax };
  });
  const shippingTax = includedGst(order.shippingPaise, 18);
  const totalTax = rows.reduce((s, r) => s + r.tax, 0) + shippingTax;

  return (
    <article className="text-sm text-ink">
      <header className="flex items-start justify-between border-b-2 border-ink pb-4">
        <div>
          <Logo />
          <p className="mt-3">ThriftSyndicate — {order.branch.name}</p>
          <p className="text-graphite">{order.branch.address}, {order.branch.city}, {order.branch.state} {order.branch.pincode}</p>
          <p className="label mt-1">GSTIN {order.branch.gstin ?? "(to be added)"}</p>
        </div>
        <div className="text-right">
          <h1 className="display text-4xl">{kind === "invoice" ? "Tax invoice" : "Packing slip"}</h1>
          <p className="label mt-2">No. {order.number}</p>
          <p className="label">Date {order.paidAt?.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" }) ?? "—"}</p>
        </div>
      </header>

      <section className="grid grid-cols-2 gap-6 py-4">
        <div>
          <p className="field-label">Bill to</p>
          <p>{order.customer.name}</p>
          <p className="text-graphite">{order.customer.phone} · {order.customer.email}</p>
        </div>
        <div>
          <p className="field-label">{order.deliveryType === "PICKUP" ? "Pickup" : "Ship to"}</p>
          {order.deliveryType === "PICKUP" || !addr ? (
            <p>Collect at {order.branch.name}</p>
          ) : (
            <p>{addr.line1}{addr.line2 ? `, ${addr.line2}` : ""}<br />{addr.city}, {addr.state} {addr.pincode}</p>
          )}
          {kind === "invoice" && <p className="label mt-1 text-steel">Place of supply: {placeOfSupply}</p>}
        </div>
      </section>

      <table className="w-full border-collapse">
        <thead>
          <tr className="field-label border-y border-ink text-left">
            <th className="py-2">Item</th>
            {kind === "invoice" ? (
              <>
                <th>HSN</th>
                <th className="text-right">Taxable</th>
                <th className="text-right">GST</th>
                <th className="text-right">Total</th>
              </>
            ) : (
              <>
                <th>SKU</th>
                <th>Rack</th>
                <th className="text-right">Qty</th>
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-mist align-top">
              <td className="py-2">{r.title}<span className="label text-steel"> · {r.size}{r.quantity > 1 ? ` × ${r.quantity}` : ""}</span></td>
              {kind === "invoice" ? (
                <>
                  <td className="label">{r.category ? hsn[r.category] : "6109"}</td>
                  <td className="text-right">{formatINR(r.taxable)}</td>
                  <td className="text-right">{formatINR(r.tax)} <span className="label text-steel">{r.rate}%</span></td>
                  <td className="text-right">{formatINR(r.gross)}</td>
                </>
              ) : (
                <>
                  <td className="label">{r.sku}</td>
                  <td className="label">{r.rackLocation ?? "—"}</td>
                  <td className="text-right">{r.quantity}</td>
                </>
              )}
            </tr>
          ))}
          {kind === "invoice" && order.shippingPaise > 0 && (
            <tr className="border-b border-mist">
              <td className="py-2">Shipping</td>
              <td className="label">9965</td>
              <td className="text-right">{formatINR(order.shippingPaise - shippingTax)}</td>
              <td className="text-right">{formatINR(shippingTax)} <span className="label text-steel">18%</span></td>
              <td className="text-right">{formatINR(order.shippingPaise)}</td>
            </tr>
          )}
        </tbody>
      </table>

      {kind === "invoice" && (
        <dl className="ml-auto mt-4 w-72 space-y-1">
          {intraState ? (
            <>
              <div className="flex justify-between"><dt>CGST</dt><dd>{formatINR(Math.floor(totalTax / 2))}</dd></div>
              <div className="flex justify-between"><dt>SGST</dt><dd>{formatINR(Math.ceil(totalTax / 2))}</dd></div>
            </>
          ) : (
            <div className="flex justify-between"><dt>IGST</dt><dd>{formatINR(totalTax)}</dd></div>
          )}
          <div className="flex justify-between border-t border-ink pt-1 text-base font-medium"><dt>Total paid</dt><dd>{formatINR(order.totalPaise)}</dd></div>
        </dl>
      )}
      {kind === "packing-slip" && order.customerNote && <p className="mt-4 border border-ink p-3">Customer note: {order.customerNote}</p>}

      <footer className="mt-10 border-t border-mist pt-4 text-xs text-graphite">
        <p className="label text-ink">All sales final — no returns, exchanges or replacements.</p>
        <p className="mt-1">If your parcel arrives damaged or wrong, message us within 48 hours with an unboxing video.</p>
      </footer>
    </article>
  );
}

