// The editable colour scheme. Pure functions only: the admin theme editor runs these in the browser
// for its live preview, and the server runs them again before saving.
import { z } from "zod";

export const themeColorKeys = ["ink", "primary", "accent", "positive", "surface", "signal"] as const;
export type ThemeColorKey = (typeof themeColorKeys)[number];
export type ThemeColors = Record<ThemeColorKey, string>;

export const themeColorInfo: Record<ThemeColorKey, { label: string; use: string }> = {
  ink: { label: "Ink", use: "Text, footer and admin sidebar. Greys are mixed from it." },
  primary: { label: "Primary", use: "Buttons, hero, selected filters" },
  accent: { label: "Accent", use: "Highlights, urgent orders, awaiting approval" },
  positive: { label: "Positive", use: "Confirmed, published, payment received" },
  surface: { label: "Surface", use: "Panels, summaries and the admin background" },
  signal: { label: "Signal", use: "Errors and the Sold overlay only" },
};

export const defaultTheme: ThemeColors = {
  ink: "#14142B",
  primary: "#2B44E0",
  accent: "#FFD23F",
  positive: "#3DDC97",
  surface: "#F1F3FF",
  signal: "#C62828",
};

const PAPER = "#FFFFFF";

const hex = z
  .string()
  .trim()
  .regex(/^#?[0-9a-fA-F]{6}$/, "Use a 6-digit hex colour like #2B44E0")
  .transform((v) => `#${v.replace("#", "").toUpperCase()}`);

export const themeColorsSchema = z.object(Object.fromEntries(themeColorKeys.map((k) => [k, hex])) as Record<ThemeColorKey, typeof hex>);

function rgb(color: string): [number, number, number] {
  const n = parseInt(color.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function toHex([r, g, b]: number[]): string {
  return `#${[r, g, b].map((c) => Math.round(c).toString(16).padStart(2, "0")).join("").toUpperCase()}`;
}

// `amount` of `a` over `b`, in sRGB (what the browser does for flat colours).
export function mix(a: string, b: string, amount: number): string {
  const [x, y] = [rgb(a), rgb(b)];
  return toHex(x.map((c, i) => c * amount + y[i] * (1 - amount)));
}

function luminance(color: string): number {
  const [r, g, b] = rgb(color).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// WCAG contrast ratio, 1 to 21.
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// Every CSS colour token the site uses, derived from the six editable colours.
export function themeTokens(c: ThemeColors): Record<string, string> {
  return {
    "--color-ink": c.ink,
    "--color-charcoal": mix(c.ink, PAPER, 0.92),
    "--color-graphite": mix(c.ink, PAPER, 0.85),
    "--color-steel": mix(c.ink, PAPER, 0.68),
    "--color-ash": mix(c.ink, PAPER, 0.28),
    "--color-mist": mix(c.ink, PAPER, 0.12),
    "--color-bone": c.surface,
    "--color-paper": PAPER,
    "--color-primary": c.primary,
    "--color-primary-strong": mix(c.primary, "#000000", 0.82),
    "--color-accent": c.accent,
    "--color-positive": c.positive,
    "--color-signal": c.signal,
  };
}

export interface ContrastProblem {
  pair: string;
  ratio: number;
  needed: number;
}

// Text must stay readable wherever the theme puts it (WCAG AA, 4.5:1 for body text).
export function contrastProblems(c: ThemeColors): ContrastProblem[] {
  const t = themeTokens(c);
  const checks: [string, string, string][] = [
    ["Ink text on white", c.ink, PAPER],
    ["Ink text on surface", c.ink, c.surface],
    ["Grey labels on surface", t["--color-steel"], c.surface],
    ["White text on primary", PAPER, c.primary],
    ["Ink text on accent", c.ink, c.accent],
    ["Ink text on positive", c.ink, c.positive],
    ["Signal errors on white", c.signal, PAPER],
  ];
  return checks
    .map(([pair, fg, bg]) => ({ pair, exact: contrast(fg, bg) }))
    .filter((p) => p.exact < 4.5)
    .map((p) => ({ pair: p.pair, ratio: Math.floor(p.exact * 10) / 10, needed: 4.5 }));
}

// Stored JSON may predate a key or hold bad data; fall back to the default for anything invalid.
export function readThemeColors(stored: unknown): ThemeColors {
  const out = { ...defaultTheme };
  if (stored && typeof stored === "object") {
    for (const k of themeColorKeys) {
      const parsed = hex.safeParse((stored as Record<string, unknown>)[k]);
      if (parsed.success) out[k] = parsed.data;
    }
  }
  return out;
}
