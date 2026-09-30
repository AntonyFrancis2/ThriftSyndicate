"use client";

import { Check } from "lucide-react";
import { useActionState, useOptimistic, useState, useTransition } from "react";
import { advanceAction, approveAction, rejectAction, toggleFoundAction, type ActionResult } from "../actions";

interface Item {
  id: string;
  title: string;
  size: string;
  sku: string;
  rackLocation: string | null;
  imageUrl: string | null;
  foundOnRack: boolean;
}

function Result({ state }: { state: ActionResult }) {
  if (!state) return null;
  return state.ok ? (
    state.message ? <p className="text-sm" role="status">{state.message}</p> : null
  ) : (
    <p className="text-sm text-signal" role="alert">{state.error}</p>
  );
}

// "Found on rack" ticks + Approve, enabled only when every item is ticked (PRD §7.2).
export function ApprovalPanel({ orderId, items }: { orderId: string; items: Item[] }) {
  const [optimistic, setOptimistic] = useOptimistic(items, (state, update: { id: string; found: boolean }) =>
    state.map((i) => (i.id === update.id ? { ...i, foundOnRack: update.found } : i)),
  );
  const [pending, start] = useTransition();
  const [approveState, setApproveState] = useState<ActionResult>(null);
  const allFound = optimistic.every((i) => i.foundOnRack);

  return (
    <section className="space-y-4 bg-paper p-5">
      <h2 className="display text-3xl">Check the rack</h2>
      <ul className="divide-y divide-mist border-y border-mist">
        {optimistic.map((i) => (
          <li key={i.id} className="flex items-center gap-4 py-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={i.imageUrl ?? ""} alt="" className="aspect-[4/5] w-16 bg-bone object-cover" />
            <div className="flex-1">
              <p className="font-medium">{i.title}</p>
              <p className="label text-steel">SKU {i.sku} · Size {i.size} · Rack <strong className="text-ink">{i.rackLocation ?? "—"}</strong></p>
            </div>
            <label className={`label flex cursor-pointer items-center gap-2 border px-3 py-2 ${i.foundOnRack ? "border-ink bg-ink text-paper" : "border-ash"}`}>
              <input
                type="checkbox"
                className="sr-only"
                checked={i.foundOnRack}
                onChange={(e) => {
                  const found = e.target.checked;
                  start(async () => {
                    setOptimistic({ id: i.id, found });
                    await toggleFoundAction(orderId, i.id, found);
                  });
                }}
              />
              {i.foundOnRack && <Check className="size-4" aria-hidden />}
              Found on rack
            </label>
          </li>
        ))}
      </ul>
      <button
        className="btn btn-primary w-full"
        disabled={!allFound || pending}
        onClick={() => start(async () => setApproveState(await approveAction(orderId)))}
      >
        Approve order
      </button>
      {!allFound && <p className="label text-steel">Tick every item as found on the rack to approve.</p>}
      <Result state={approveState} />
    </section>
  );
}

const reasons = [
  { value: "SOLD_IN_STORE", label: "Item sold in store" },
  { value: "DAMAGED", label: "Item damaged" },
  { value: "CANNOT_LOCATE", label: "Can't locate item" },
  { value: "SUSPECTED_FRAUD", label: "Suspected fraud" },
  { value: "OTHER", label: "Other (add a note)" },
];

export function RejectForm({ orderId, amount }: { orderId: string; amount: string }) {
  const [state, action, pending] = useActionState(rejectAction.bind(null, orderId), null);
  return (
    <form
      action={action}
      className="space-y-4 bg-paper p-5"
      onSubmit={(e) => {
        if (!window.confirm(`Reject this order and refund ${amount} in full? This can't be undone.`)) e.preventDefault();
      }}
    >
      <h2 className="display text-3xl">Reject</h2>
      <fieldset className="space-y-2">
        <legend className="field-label mb-1">Reason</legend>
        {reasons.map((r) => (
          <label key={r.value} className="flex items-center gap-2 text-sm">
            <input type="radio" name="reason" value={r.value} required className="accent-ink" />
            {r.label}
          </label>
        ))}
      </fieldset>
      <label className="block">
        <span className="field-label">Note</span>
        <textarea name="note" rows={2} className="box mt-1" maxLength={500} />
      </label>
      <button disabled={pending} className="btn btn-secondary w-full">Reject and refund {amount}</button>
      <p className="label text-steel">Sold in store marks the piece sold. Damaged / can&apos;t locate hides it for review. Fraud / other puts it back on sale.</p>
      <Result state={state} />
    </form>
  );
}

const nextLabel: Record<string, string> = {
  PACKED: "Mark packed",
  SHIPPED: "Mark shipped",
  READY_FOR_PICKUP: "Mark ready for pickup",
  DELIVERED: "Mark delivered",
  COLLECTED: "Mark collected",
};

export function FulfilmentForm({ orderId, next }: { orderId: string; next: string }) {
  const [state, action, pending] = useActionState(advanceAction.bind(null, orderId), null);
  return (
    <form action={action} className="space-y-4 bg-paper p-5">
      <h2 className="display text-3xl">Fulfilment</h2>
      <input type="hidden" name="to" value={next} />
      {next === "SHIPPED" && (
        <div className="space-y-3">
          <label className="block"><span className="field-label">Courier</span><input name="courier" required className="field" placeholder="Delhivery" /></label>
          <label className="block"><span className="field-label">AWB number</span><input name="awb" required className="field" /></label>
          <label className="block"><span className="field-label">Tracking link (optional)</span><input name="trackingUrl" type="url" className="field" /></label>
        </div>
      )}
      {next === "COLLECTED" && (
        <label className="block"><span className="field-label">Customer&apos;s pickup code</span><input name="pickupOtp" required inputMode="numeric" className="field" /></label>
      )}
      <button disabled={pending} className="btn btn-primary w-full">{nextLabel[next]}</button>
      <Result state={state} />
    </form>
  );
}
