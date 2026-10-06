"use server";

import { updateTag } from "next/cache";
import { requireAdmin } from "@/lib/auth/session";
import { DomainError } from "@/lib/errors";
import type { ThemeColors } from "@/lib/theme";
import { THEME_TAG } from "@/lib/theme-cache";
import { saveTheme } from "@/lib/theme-store";

export type ThemeResult = { ok: true; colors: ThemeColors } | { ok: false; error: string };

export async function saveThemeAction(colors: ThemeColors): Promise<ThemeResult> {
  const admin = await requireAdmin();
  try {
    const saved = await saveTheme(admin, colors);
    // Every page reads the theme from the cache; expire it so the next request shows the new colours.
    updateTag(THEME_TAG);
    return { ok: true, colors: saved };
  } catch (err) {
    if (err instanceof DomainError) return { ok: false, error: err.message };
    throw err;
  }
}
