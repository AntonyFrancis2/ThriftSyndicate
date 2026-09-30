"use client";

import Link from "next/link";
import { useState } from "react";
import { bag, useBag } from "@/lib/bag-store";

interface Variant {
  id: string;
  size: string;
  free: boolean;
}

export function AddToBag({ variants, availability }: { variants: Variant[]; availability: "available" | "on_hold" | "sold" }) {
  const lines = useBag();
  const firstFree = variants.find((v) => v.free);
  const [selected, setSelected] = useState(firstFree?.id ?? variants[0]?.id);
  const inBag = lines.some((l) => l.variantId === selected);
  const current = variants.find((v) => v.id === selected);

  if (availability === "sold") {
    return <p className="display text-3xl text-signal">Sold</p>;
  }

  return (
    <div className="space-y-4">
      {variants.length > 1 && (
        <fieldset>
          <legend className="field-label mb-2">Size</legend>
          <div className="flex flex-wrap gap-2">
            {variants.map((v) => (
              <button
                key={v.id}
                type="button"
                disabled={!v.free}
                onClick={() => setSelected(v.id)}
                aria-pressed={selected === v.id}
                className={`label min-w-12 border px-3 py-2 ${selected === v.id ? "border-ink bg-ink text-paper" : "border-ash"} disabled:line-through disabled:opacity-40`}
              >
                {v.size}
              </button>
            ))}
          </div>
        </fieldset>
      )}
      {availability === "on_hold" || !current?.free ? (
        <p className="border border-ink p-3 text-sm">
          <span className="label mr-2">On hold</span>
          Someone is paying for this right now. If they don&apos;t complete payment in 15 minutes it comes back.
        </p>
      ) : inBag ? (
        <Link href="/bag" className="btn btn-secondary w-full">In your bag — view bag</Link>
      ) : (
        <button type="button" className="btn btn-primary w-full" onClick={() => selected && bag.add(selected)}>
          Add to bag
        </button>
      )}
      <p className="tag w-full border-ink py-2 text-center">Final sale — no returns or exchanges</p>
    </div>
  );
}
