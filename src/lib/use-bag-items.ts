"use client";

import { useEffect, useState } from "react";
import { useBag } from "@/lib/bag-store";

export interface BagItem {
  variantId: string;
  productId: string;
  slug: string;
  title: string;
  size: string;
  era: "RETRO" | "LATEST";
  pricePaise: number;
  imageUrl: string | null;
  branch: { id: string; name: string; pickupEnabled: boolean };
  available: number;
  quantity: number;
}

// Joins the browser bag with fresh prices and availability from the server.
export function useBagItems() {
  const lines = useBag();
  const [data, setData] = useState<{ key: string; items: Omit<BagItem, "quantity">[] } | null>(null);
  const key = lines.map((l) => l.variantId).sort().join(",");

  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    fetch("/api/bag", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ variantIds: key.split(",") }) })
      .then((r) => r.json())
      .then((d) => !cancelled && setData({ key, items: d.items }))
      .catch(() => !cancelled && setData({ key, items: [] }));
    return () => {
      cancelled = true;
    };
  }, [key]);

  const loading = key !== "" && data?.key !== key;
  const items: BagItem[] = !key
    ? []
    : lines.flatMap((l) => {
        const info = data?.items.find((i) => i.variantId === l.variantId);
        return info ? [{ ...info, quantity: l.quantity }] : [];
      });
  return { items, loading, empty: lines.length === 0 };
}

export function groupByBranch(items: BagItem[]) {
  const groups = new Map<string, { branch: BagItem["branch"]; items: BagItem[] }>();
  for (const item of items) {
    const g = groups.get(item.branch.id) ?? { branch: item.branch, items: [] };
    g.items.push(item);
    groups.set(item.branch.id, g);
  }
  return [...groups.values()];
}
