"use client";

import { useSyncExternalStore } from "react";

// The bag lives in the browser. It does not reserve anything; items are reserved only
// when the customer clicks Pay (BR5, PRD §6.6).
export interface BagLine {
  variantId: string;
  quantity: number;
}

const KEY = "ts_bag_v1";
const listeners = new Set<() => void>();
let cache: BagLine[] | null = null;
const EMPTY: BagLine[] = [];

function read(): BagLine[] {
  if (cache) return cache;
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    cache = Array.isArray(parsed) ? parsed.filter((l) => typeof l?.variantId === "string" && l.quantity > 0) : [];
  } catch {
    cache = [];
  }
  return cache!;
}

function write(lines: BagLine[]) {
  cache = lines;
  try {
    localStorage.setItem(KEY, JSON.stringify(lines));
  } catch {
    // storage blocked: the bag still works for this page view
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) {
      cache = null;
      listener();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function useBag() {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}

export const bag = {
  add(variantId: string, max = 1) {
    const lines = read();
    const existing = lines.find((l) => l.variantId === variantId);
    if (existing) {
      write(lines.map((l) => (l.variantId === variantId ? { ...l, quantity: Math.min(max, l.quantity + 1) } : l)));
    } else {
      write([...lines, { variantId, quantity: 1 }]);
    }
  },
  setQuantity(variantId: string, quantity: number) {
    write(quantity <= 0 ? read().filter((l) => l.variantId !== variantId) : read().map((l) => (l.variantId === variantId ? { ...l, quantity } : l)));
  },
  remove(variantId: string) {
    write(read().filter((l) => l.variantId !== variantId));
  },
  removeMany(variantIds: string[]) {
    write(read().filter((l) => !variantIds.includes(l.variantId)));
  },
  clear() {
    write([]);
  },
};
