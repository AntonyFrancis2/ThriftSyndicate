import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth/session";
import { formatDateTime } from "@/lib/time";
import { loadTheme } from "@/lib/theme-store";
import { ThemeEditor } from "./theme-editor";

export const metadata: Metadata = { title: "Theme" };

export default async function ThemePage() {
  await requireAdmin();
  const theme = await loadTheme();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="display text-5xl">Theme</h1>
        <p className="mt-2 max-w-2xl text-graphite">
          The colours of the shop and this admin panel, for both stores. Changes show in the preview straight away and go live for
          everyone when you save.
        </p>
        <p className="label mt-2 text-steel">
          {theme.updatedAt ? `Last changed ${formatDateTime(theme.updatedAt)}${theme.updatedBy ? ` by ${theme.updatedBy}` : ""}` : "Using the default colours"}
        </p>
      </div>
      <ThemeEditor saved={theme.colors} />
    </div>
  );
}
