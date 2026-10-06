import "server-only";
import { db } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import type { AdminActor } from "@/lib/orders/decisions";
import { contrastProblems, readThemeColors, themeColorsSchema, type ThemeColors } from "@/lib/theme";

const THEME_ID = "default";

export async function loadTheme(): Promise<{ colors: ThemeColors; updatedAt: Date | null; updatedBy: string | null }> {
  const row = await db.siteTheme.findUnique({ where: { id: THEME_ID }, include: { updatedBy: true } });
  return { colors: readThemeColors(row?.colors), updatedAt: row?.updatedAt ?? null, updatedBy: row?.updatedBy?.name ?? null };
}

// Any admin may change the colours (they apply to both branches). Unreadable combinations are refused.
export async function saveTheme(actor: AdminActor, input: unknown): Promise<ThemeColors> {
  const parsed = themeColorsSchema.safeParse(input);
  if (!parsed.success) throw new DomainError("INVALID_THEME", parsed.error.issues[0].message);
  const colors = parsed.data;
  const problems = contrastProblems(colors);
  if (problems.length > 0) {
    const p = problems[0];
    throw new DomainError("LOW_CONTRAST", `${p.pair} is too hard to read (${p.ratio}:1, needs ${p.needed}:1).`, problems);
  }

  const before = await loadTheme();
  await db.$transaction([
    db.siteTheme.upsert({
      where: { id: THEME_ID },
      create: { id: THEME_ID, colors, updatedById: actor.id },
      update: { colors, updatedById: actor.id },
    }),
    db.auditLog.create({
      data: { adminId: actor.id, action: "theme.update", entity: "SiteTheme", entityId: THEME_ID, before: before.colors, after: colors },
    }),
  ]);
  return colors;
}
