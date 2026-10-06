import "server-only";
import { unstable_cache } from "next/cache";
import { defaultTheme, type ThemeColors } from "@/lib/theme";
import { loadTheme } from "@/lib/theme-store";

export const THEME_TAG = "theme";

// Every page reads the theme, so it is cached until an admin saves a new one (updateTag(THEME_TAG)).
const cached = unstable_cache(async () => (await loadTheme()).colors, ["site-theme"], { tags: [THEME_TAG] });

export async function getSiteTheme(): Promise<ThemeColors> {
  try {
    return await cached();
  } catch (err) {
    // A missing database (e.g. at build time) must not take the site down; fall back to the defaults.
    console.error("Could not load the site theme, using defaults", err);
    return defaultTheme;
  }
}
