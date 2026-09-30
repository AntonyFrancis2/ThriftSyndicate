"use client";

import { Search, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useState } from "react";

interface Suggestion {
  label: string;
  href: string;
}

export function SearchBox({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<{ products: Suggestion[]; terms: Suggestion[] }>({ products: [], terms: [] });
  const listId = useId();

  useEffect(() => {
    if (q.trim().length < 2) return;
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/suggest?q=${encodeURIComponent(q)}`, { signal: ctrl.signal })
        .then((r) => r.json())
        .then(setResults)
        .catch(() => {});
    }, 150);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q]);

  const visible = q.trim().length >= 2 ? results : { products: [], terms: [] };
  const hasResults = visible.products.length + visible.terms.length > 0;

  return (
    <div className="absolute inset-x-0 top-full border-b border-mist bg-paper text-ink shadow-sm">
      <form
        role="search"
        className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (q.trim()) {
            router.push(`/shop?q=${encodeURIComponent(q.trim())}`);
            onClose();
          }
        }}
      >
        <Search className="size-5 shrink-0" strokeWidth={1.5} aria-hidden />
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Escape" && onClose()}
          placeholder="Search teams, bands, brands, decades…"
          aria-label="Search"
          aria-controls={listId}
          className="field border-b-0 text-lg"
        />
        <button type="button" onClick={onClose} aria-label="Close search" className="p-2">
          <X className="size-5" strokeWidth={1.5} />
        </button>
      </form>
      {hasResults && (
        <ul id={listId} className="mx-auto max-w-3xl px-4 pb-4">
          {visible.terms.map((s) => (
            <li key={s.href}>
              <Link href={s.href} onClick={onClose} className="label block py-2 text-steel hover:text-ink">
                {s.label}
              </Link>
            </li>
          ))}
          {visible.products.map((s) => (
            <li key={s.href}>
              <Link href={s.href} onClick={onClose} className="block py-2 hover:underline">
                {s.label}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
