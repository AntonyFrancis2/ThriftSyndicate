"use client";

import { Plus, X } from "lucide-react";
import { useState, useTransition } from "react";
import { saveProductAction, type FormResult } from "./actions";

export interface ProductFormValues {
  branchId: string;
  title: string;
  description: string;
  category: "TSHIRT" | "JEANS" | "JERSEY";
  era: "RETRO" | "LATEST";
  brand: string;
  team: string;
  season: string;
  kitType: string;
  authenticity: string;
  playerPrint: string;
  decade: string;
  condition: string;
  flaws: string;
  measurements: Record<string, string>;
  material: string;
  colour: string;
  price: string;
  compareAt: string;
  rackLocation: string;
  tags: string;
  images: string;
  variants: { size: string; stockQty: string }[];
}

const topFields = [["chest", "Chest (pit to pit)"], ["length", "Length"], ["shoulder", "Shoulder"]] as const;
const jeansFields = [["waist", "Waist (flat ×2)"], ["inseam", "Inseam"], ["rise", "Rise"], ["legOpening", "Leg opening"]] as const;

function Text({ label, value, onChange, error, ...props }: { label: string; value: string; onChange: (v: string) => void; error?: string } & Omit<React.ComponentProps<"input">, "onChange" | "value">) {
  return (
    <label className="block">
      <span className="field-label">{label}</span>
      <input {...props} value={value} onChange={(e) => onChange(e.target.value)} className="field" aria-invalid={!!error} />
      {error && <span className="text-xs text-signal">{error}</span>}
    </label>
  );
}

export function ProductForm({
  id,
  initial,
  branches,
  lockBranch,
  status,
}: {
  id: string | null;
  initial: ProductFormValues;
  branches: { id: string; name: string }[];
  lockBranch: boolean;
  status?: string;
}) {
  const [v, setV] = useState(initial);
  const [result, setResult] = useState<FormResult>(null);
  const [pending, start] = useTransition();
  const set = <K extends keyof ProductFormValues>(k: K) => (val: ProductFormValues[K]) => setV((s) => ({ ...s, [k]: val }));
  const fields = result && !result.ok ? (result.fields ?? {}) : {};
  const measurementFields = v.category === "JEANS" ? jeansFields : topFields;
  const images = v.images.split("\n").map((s) => s.trim()).filter(Boolean);
  const retroGrades = [["DEADSTOCK", "Deadstock"], ["EXCELLENT", "Excellent"], ["VERY_GOOD", "Very good"], ["GOOD", "Good"]];
  const latestGrades = [["NEW", "New"], ["LIKE_NEW", "Like new"]];

  function submit(publish: boolean) {
    const toPaise = (s: string) => (s.trim() ? Math.round(Number(s) * 100) : null);
    const payload = {
      branchId: v.branchId,
      title: v.title,
      description: v.description,
      category: v.category,
      era: v.era,
      brand: v.brand,
      team: v.team,
      season: v.season,
      kitType: v.kitType,
      authenticity: v.authenticity,
      playerPrint: v.playerPrint,
      decade: v.decade ? Number(v.decade) : null,
      condition: v.condition,
      flaws: v.flaws.split("\n").map((s) => s.trim()).filter(Boolean),
      measurements: Object.fromEntries(
        measurementFields.filter(([k]) => v.measurements[k]?.trim()).map(([k]) => [k, Number(v.measurements[k])]),
      ),
      material: v.material,
      colour: v.colour,
      pricePaise: toPaise(v.price),
      compareAtPaise: toPaise(v.compareAt),
      rackLocation: v.rackLocation,
      tags: v.tags.split(",").map((s) => s.trim()).filter(Boolean),
      images,
      variants: v.variants.filter((x) => x.size.trim()).map((x) => ({ size: x.size, stockQty: Number(x.stockQty || 0) })),
    };
    start(async () => setResult(await saveProductAction(id, payload, publish)));
  }

  return (
    <form
      className="grid gap-6 xl:grid-cols-[1fr_380px]"
      onSubmit={(e) => {
        e.preventDefault();
        submit(false);
      }}
    >
      <div className="space-y-6">
        <section className="grid gap-5 bg-paper p-5 md:grid-cols-2">
          <div className="md:col-span-2">
            <Text label="Title" value={v.title} onChange={set("title")} error={fields.title} placeholder="Manchester United 1999 Home Jersey" required />
          </div>
          <label className="block">
            <span className="field-label">Category</span>
            <select value={v.category} onChange={(e) => set("category")(e.target.value as ProductFormValues["category"])} className="field">
              <option value="TSHIRT">T-shirt</option>
              <option value="JEANS">Jeans</option>
              <option value="JERSEY">Jersey</option>
            </select>
          </label>
          <label className="block">
            <span className="field-label">Era</span>
            <select
              value={v.era}
              onChange={(e) => {
                const era = e.target.value as ProductFormValues["era"];
                setV((s) => ({ ...s, era, condition: era === "RETRO" ? "EXCELLENT" : "NEW" }));
              }}
              className="field"
            >
              <option value="RETRO">Retro (vintage / pre-owned)</option>
              <option value="LATEST">Latest (current season)</option>
            </select>
          </label>
          <Text label="Brand" value={v.brand} onChange={set("brand")} error={fields.brand} required />
          <Text label="Decade (e.g. 1990)" value={v.decade} onChange={set("decade")} inputMode="numeric" error={fields.decade} />
          <Text label="Material" value={v.material} onChange={set("material")} />
          <Text label="Colour" value={v.colour} onChange={set("colour")} />
          <label className="block md:col-span-2">
            <span className="field-label">Description</span>
            <textarea value={v.description} onChange={(e) => set("description")(e.target.value)} rows={3} className="box mt-1" />
          </label>
        </section>

        {v.category === "JERSEY" && (
          <section className="grid gap-5 bg-paper p-5 md:grid-cols-2">
            <h2 className="field-label md:col-span-2">Jersey details</h2>
            <Text label="Team" value={v.team} onChange={set("team")} error={fields.team} />
            <Text label="Season" value={v.season} onChange={set("season")} placeholder="1998/99" />
            <label className="block">
              <span className="field-label">Kit</span>
              <select value={v.kitType} onChange={(e) => set("kitType")(e.target.value)} className="field">
                <option value="">—</option><option>Home</option><option>Away</option><option>Third</option><option>Goalkeeper</option><option>Training</option>
              </select>
            </label>
            <label className="block">
              <span className="field-label">Authentic or replica</span>
              <select value={v.authenticity} onChange={(e) => set("authenticity")(e.target.value)} className="field">
                <option value="">—</option><option>Authentic</option><option>Replica</option>
              </select>
            </label>
            <Text label="Player name / number printed" value={v.playerPrint} onChange={set("playerPrint")} />
          </section>
        )}

        <section className="grid gap-5 bg-paper p-5 md:grid-cols-2">
          <h2 className="field-label md:col-span-2">Condition and measurements (cm, laid flat)</h2>
          <label className="block">
            <span className="field-label">Condition</span>
            <select value={v.condition} onChange={(e) => set("condition")(e.target.value)} className="field">
              {(v.era === "RETRO" ? retroGrades : latestGrades).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-3">
            {measurementFields.map(([k, label]) => (
              <Text key={k} label={label} value={v.measurements[k] ?? ""} onChange={(val) => set("measurements")({ ...v.measurements, [k]: val })} inputMode="decimal" />
            ))}
          </div>
          <label className="block md:col-span-2">
            <span className="field-label">Flaws (one per line — photograph each one)</span>
            <textarea value={v.flaws} onChange={(e) => set("flaws")(e.target.value)} rows={3} className="box mt-1" placeholder="Small hole near collar seam" />
          </label>
        </section>

        <section className="space-y-3 bg-paper p-5">
          <h2 className="field-label">Photos (4–8: front, back, tag, detail, flaws) — one URL per line, in display order</h2>
          <textarea value={v.images} onChange={(e) => set("images")(e.target.value)} rows={5} className="box font-mono text-xs" aria-invalid={!!fields.images} />
          {fields.images && <p className="text-xs text-signal">{fields.images}</p>}
          <div className="flex flex-wrap gap-2">
            {images.map((src, i) => (
              <figure key={`${src}-${i}`} className="relative w-20">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt="" className="aspect-[4/5] w-full bg-bone object-cover" />
                <figcaption className="label text-steel">{i + 1}</figcaption>
              </figure>
            ))}
          </div>
          <p className="label text-steel">Photo upload with automatic resizing arrives with the image CDN (Cloudinary). For now, paste image URLs.</p>
        </section>
      </div>

      <div className="space-y-6">
        <section className="space-y-5 bg-paper p-5">
          <label className="block">
            <span className="field-label">Branch</span>
            <select value={v.branchId} onChange={(e) => set("branchId")(e.target.value)} disabled={lockBranch} className="field">
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <Text label="Price ₹ (incl. GST)" value={v.price} onChange={set("price")} inputMode="decimal" error={fields.pricePaise} required />
            <Text label="Compare-at ₹" value={v.compareAt} onChange={set("compareAt")} inputMode="decimal" />
          </div>
          <Text label="Rack / shelf" value={v.rackLocation} onChange={set("rackLocation")} placeholder="J-02" />
          <Text label="Tags (comma separated)" value={v.tags} onChange={set("tags")} placeholder="90s football, treble" />
        </section>

        <section className="space-y-3 bg-paper p-5">
          <h2 className="field-label">Sizes and stock {v.era === "RETRO" && "(retro pieces are usually one of one)"}</h2>
          {v.variants.map((row, i) => (
            <div key={i} className="flex items-end gap-3">
              <Text label="Size on tag" value={row.size} onChange={(val) => set("variants")(v.variants.map((r, j) => (j === i ? { ...r, size: val } : r)))} />
              <Text label="Stock" value={row.stockQty} onChange={(val) => set("variants")(v.variants.map((r, j) => (j === i ? { ...r, stockQty: val } : r)))} inputMode="numeric" />
              <button type="button" aria-label="Remove size" className="p-2" onClick={() => set("variants")(v.variants.filter((_, j) => j !== i))} disabled={v.variants.length === 1}>
                <X className="size-4" />
              </button>
            </div>
          ))}
          {fields.variants && <p className="text-xs text-signal">{fields.variants}</p>}
          <button type="button" className="label flex items-center gap-1 underline" onClick={() => set("variants")([...v.variants, { size: "", stockQty: "1" }])}>
            <Plus className="size-3" /> Add size
          </button>
        </section>

        {result && !result.ok && <p className="border border-signal bg-paper p-3 text-sm text-signal" role="alert">{result.error}</p>}

        <div className="grid gap-2">
          <button type="submit" disabled={pending} className="btn btn-secondary">{pending ? "Saving…" : status === "PUBLISHED" ? "Save changes" : "Save draft"}</button>
          {status !== "PUBLISHED" && status !== "SOLD" && (
            <button type="button" disabled={pending} onClick={() => submit(true)} className="btn btn-primary">Save and publish</button>
          )}
        </div>
      </div>
    </form>
  );
}
