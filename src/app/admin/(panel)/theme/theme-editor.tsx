"use client";

import { AlertCircle, ArrowRight, Check, RotateCcw, ShoppingBag } from "lucide-react";
import { useState, useTransition } from "react";
import { Logo } from "@/components/logo";
import { StatusBadge } from "@/components/order-status";
import { contrastProblems, defaultTheme, themeColorInfo, themeColorKeys, themeTokens, type ThemeColorKey, type ThemeColors } from "@/lib/theme";
import { saveThemeAction } from "./actions";

const hexPattern = /^#[0-9a-fA-F]{6}$/;

export function ThemeEditor({ saved: initial }: { saved: ThemeColors }) {
  const [saved, setSaved] = useState(initial);
  const [colors, setColors] = useState(initial);
  // What the admin is typing into a hex box, before it is a complete colour.
  const [drafts, setDrafts] = useState<Partial<Record<ThemeColorKey, string>>>({});
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const problems = contrastProblems(colors);
  const dirty = themeColorKeys.some((k) => colors[k] !== saved[k]);
  const isDefault = themeColorKeys.every((k) => colors[k] === defaultTheme[k]);

  function set(key: ThemeColorKey, value: string) {
    setDrafts((d) => ({ ...d, [key]: value }));
    const v = value.startsWith("#") ? value : `#${value}`;
    if (hexPattern.test(v)) setColors((c) => ({ ...c, [key]: v.toUpperCase() }));
    setMessage(null);
  }

  function replaceAll(next: ThemeColors) {
    setColors(next);
    setDrafts({});
    setMessage(null);
  }

  function save() {
    startTransition(async () => {
      const result = await saveThemeAction(colors);
      if (result.ok) {
        setSaved(result.colors);
        replaceAll(result.colors);
        setMessage({ ok: true, text: "Saved. The new colours are live on the shop and admin." });
      } else {
        setMessage({ ok: false, text: result.error });
      }
    });
  }

  return (
    <div className="space-y-6">
      <div className="sticky top-0 z-10 -mx-4 border-b border-mist bg-paper px-4 py-4 md:-mx-8 md:px-8" role="toolbar" aria-label="Theme colours">
        <div className="flex flex-wrap items-end gap-x-5 gap-y-4">
          {themeColorKeys.map((k) => (
            <div key={k} className="w-36">
              <label htmlFor={`colour-${k}`} className="field-label block" title={themeColorInfo[k].use}>
                {themeColorInfo[k].label}
              </label>
              <div className="mt-1 flex items-center gap-2">
                <input
                  type="color"
                  value={colors[k].toLowerCase()}
                  onChange={(e) => set(k, e.target.value)}
                  aria-label={`${themeColorInfo[k].label} colour picker`}
                  className="size-11 shrink-0 cursor-pointer border border-mist bg-paper p-0.5"
                />
                <input
                  id={`colour-${k}`}
                  value={drafts[k] ?? colors[k]}
                  onChange={(e) => set(k, e.target.value)}
                  onBlur={() => setDrafts((d) => ({ ...d, [k]: undefined }))}
                  maxLength={7}
                  spellCheck={false}
                  aria-describedby={`use-${k}`}
                  className="field label min-w-0 py-2"
                />
              </div>
              <p id={`use-${k}`} className="sr-only">{themeColorInfo[k].use}</p>
            </div>
          ))}
          <div className="ml-auto flex flex-wrap gap-2">
            <button type="button" className="btn btn-secondary" onClick={() => replaceAll(defaultTheme)} disabled={isDefault || pending}>
              <RotateCcw className="size-4" strokeWidth={1.5} aria-hidden /> Defaults
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => replaceAll(saved)} disabled={!dirty || pending}>
              Discard
            </button>
            <button type="button" className="btn btn-primary" onClick={save} disabled={!dirty || problems.length > 0 || pending}>
              <Check className="size-4" strokeWidth={1.5} aria-hidden /> {pending ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
        {problems.length > 0 && (
          <ul className="mt-3 space-y-1 text-sm text-signal" role="alert">
            {problems.map((p) => (
              <li key={p.pair} className="flex items-center gap-2">
                <AlertCircle className="size-4 shrink-0" strokeWidth={1.5} aria-hidden />
                {p.pair} is too hard to read: {p.ratio}:1, needs {p.needed}:1.
              </li>
            ))}
          </ul>
        )}
        {message && (
          <p className={`mt-3 text-sm ${message.ok ? "" : "text-signal"}`} role="status">
            {message.text}
          </p>
        )}
      </div>

      <section aria-label="Preview" className="border border-mist" style={themeTokens(colors) as React.CSSProperties}>
        <Preview />
      </section>
    </div>
  );
}

// A slice of every surface the theme touches, using the real classes, so the preview matches the live site.
function Preview() {
  return (
    <div className="bg-paper text-ink">
      <div className="flex items-center justify-between border-b border-mist px-5 py-3 [--logo-bg:var(--color-paper)]">
        <span className="label hidden gap-4 sm:flex">
          <span>Retro</span>
          <span>Latest</span>
          <span>Jerseys</span>
        </span>
        <Logo />
        <span className="relative p-2">
          <ShoppingBag className="size-5" strokeWidth={1.5} aria-hidden />
          <span className="label absolute -right-0.5 -top-0.5 grid size-5 place-items-center rounded-full bg-primary text-[10px] text-paper">2</span>
        </span>
      </div>

      <div className="bg-primary px-5 py-10 text-paper">
        <p className="label text-accent">Drop 001 · Retro &amp; latest</p>
        <p className="display mt-3 text-5xl text-accent md:text-6xl">One piece. One owner.</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <span className="btn bg-accent text-ink">
            Shop the drop <ArrowRight className="size-4" strokeWidth={1.5} aria-hidden />
          </span>
          <span className="btn border-paper text-paper">Browse retro</span>
        </div>
      </div>
      <p className="label bg-accent px-5 py-3 text-ink">Every piece photographed in-house · Secure payment by Razorpay</p>

      <div className="grid gap-6 p-5 md:grid-cols-3">
        <div>
          <div className="relative aspect-[4/5] bg-bone">
            <span className="tag absolute left-3 top-3 bg-paper text-ink">Retro / 1990s</span>
            <span className="tag absolute right-3 top-3 border-primary bg-primary text-paper">On hold</span>
          </div>
          <div className="mt-3 flex justify-between gap-3 text-sm font-medium">
            <span>Manchester United 1999 Home Jersey</span>
            <span className="label">₹4,499</span>
          </div>
          <div className="mt-1 flex items-center gap-2 text-steel">
            <span className="label">Size L</span>
            <span className="tag border-positive bg-positive text-ink">Very good</span>
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <StatusBadge status="AWAITING_APPROVAL" />
            <StatusBadge status="CONFIRMED" />
            <StatusBadge status="REJECTED" />
          </div>
          <span className="btn btn-primary w-full">Pay ₹13,797</span>
          <span className="btn btn-secondary w-full">Keep shopping</span>
          <div>
            <span className="field-label">Email</span>
            <span className="field block border-signal text-ink" aria-hidden>
              asha@example
            </span>
            <span className="mt-1 flex items-center gap-1 text-sm text-signal">
              <AlertCircle className="size-4" strokeWidth={1.5} aria-hidden /> Enter a valid email address
            </span>
          </div>
        </div>

        <div className="space-y-3 bg-bone p-4">
          <p className="display text-2xl">Review &amp; pay</p>
          <p className="label text-steel">Shipping (2 parcels) · Free</p>
          <p className="border-2 border-primary bg-paper p-3 text-sm">
            <strong>I understand all sales are final.</strong> No returns or exchanges.
          </p>
          <p className="bg-positive p-3 text-sm text-ink">Approved. The customer has been told.</p>
        </div>
      </div>

      <div className="flex flex-col border-t border-mist md:flex-row">
        <div className="bg-ink p-4 text-paper md:w-48 [--logo-bg:var(--color-ink)]">
          <Logo />
          <p className="label mt-4 bg-accent px-3 py-2 text-ink">Orders</p>
          <p className="label px-3 py-2 text-ash">Products</p>
        </div>
        <div className="flex-1 space-y-px bg-bone p-4">
          <p className="flex flex-wrap justify-between gap-2 bg-accent p-3 text-sm text-ink">
            <span className="label">TS-BAN-00385</span>
            <span>Riya Shah · 2 items</span>
            <span className="label">Overdue in 2h 50m</span>
          </p>
          <p className="flex flex-wrap justify-between gap-2 bg-paper p-3 text-sm">
            <span className="label">TS-IND-01042</span>
            <span>Aarav Mehta · 2 items</span>
            <span className="label text-steel">23h 40m left</span>
          </p>
        </div>
      </div>

      <div className="relative grid h-28 place-items-center bg-bone">
        <span className="display -rotate-6 border-2 border-signal px-4 py-1 text-3xl text-signal">Sold</span>
      </div>
    </div>
  );
}
