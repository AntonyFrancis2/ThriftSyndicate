"use client";

import { useState } from "react";

// Rough estimate until the courier integration (Shiprocket) supplies real serviceability dates.
function estimate(from: string, to: string) {
  const sameCity = from.slice(0, 3) === to.slice(0, 3);
  const sameRegion = from[0] === to[0];
  const [min, max] = sameCity ? [1, 2] : sameRegion ? [3, 5] : [4, 7];
  const fmt = (d: number) => new Date(Date.now() + d * 86_400_000).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
  return `${fmt(min)} – ${fmt(max)}`;
}

export function DeliveryEstimate({ fromPincode }: { fromPincode: string }) {
  const [pin, setPin] = useState("");
  const valid = /^[1-9][0-9]{5}$/.test(pin);
  return (
    <div>
      <label className="field-label" htmlFor="pin">Estimated delivery</label>
      <div className="flex items-end gap-3">
        <input id="pin" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" placeholder="Enter PIN code" className="field max-w-40" />
        {valid && <span className="text-sm">Arrives {estimate(fromPincode, pin)} after the store confirms</span>}
      </div>
    </div>
  );
}
