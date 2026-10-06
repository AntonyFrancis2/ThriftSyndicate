"use client";

import { useActionState } from "react";
import { lookupOrderAction } from "./actions";

export default function OrderLookupPage() {
  const [state, action, pending] = useActionState(lookupOrderAction, null);
  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <h1 className="display text-5xl">Track an order</h1>
      <p className="mt-3 text-graphite">Use the order number from your confirmation email or SMS.</p>
      <form action={action} className="mt-8 space-y-5">
        <label className="block">
          <span className="field-label">Order number</span>
          <input name="number" required placeholder="TS-IND-260930-1A2B3" className="field uppercase" defaultValue={state?.number} key={`n-${state?.number}`} />
        </label>
        <label className="block">
          <span className="field-label">Mobile number</span>
          <input name="phone" required type="tel" inputMode="tel" className="field" defaultValue={state?.phone} key={`p-${state?.phone}`} />
        </label>
        {state?.error && <p className="text-sm text-signal" role="alert">{state.error}</p>}
        <button disabled={pending} className="btn btn-primary w-full">{pending ? "Looking…" : "Find my order"}</button>
      </form>
    </div>
  );
}
