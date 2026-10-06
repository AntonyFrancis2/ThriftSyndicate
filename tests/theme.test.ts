import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import { contrast, contrastProblems, defaultTheme, mix, readThemeColors, themeTokens } from "@/lib/theme";
import { loadTheme, saveTheme } from "@/lib/theme-store";
import { makeAdmin, makeBranch, resetDb } from "./helpers";

describe("theme colours", () => {
  it("measures WCAG contrast", () => {
    expect(contrast("#000000", "#FFFFFF")).toBeCloseTo(21, 0);
    expect(contrast("#777777", "#777777")).toBe(1);
  });

  it("mixes colours in sRGB", () => {
    expect(mix("#000000", "#FFFFFF", 0.5)).toBe("#808080");
    expect(mix("#2B44E0", "#FFFFFF", 1)).toBe("#2B44E0");
  });

  it("ships a readable default", () => {
    expect(contrastProblems(defaultTheme)).toEqual([]);
  });

  it("derives every token from the six colours, greys from ink", () => {
    const t = themeTokens({ ...defaultTheme, ink: "#000000" });
    expect(t["--color-ink"]).toBe("#000000");
    expect(t["--color-steel"]).toBe(mix("#000000", "#FFFFFF", 0.68));
    expect(t["--color-bone"]).toBe(defaultTheme.surface);
    expect(t["--color-paper"]).toBe("#FFFFFF");
  });

  it("flags text that would be hard to read", () => {
    const problems = contrastProblems({ ...defaultTheme, primary: "#9DB8D6", accent: "#2B2B2B" });
    expect(problems.map((p) => p.pair)).toEqual(["White text on primary", "Ink text on accent"]);
    expect(problems[0].ratio).toBeLessThan(4.5);
  });

  it("falls back to the default for missing or bad stored values", () => {
    expect(readThemeColors(null)).toEqual(defaultTheme);
    expect(readThemeColors({ primary: "ff0000", accent: "nope" })).toEqual({ ...defaultTheme, primary: "#FF0000" });
  });
});

describe("saving the theme", () => {
  beforeEach(resetDb);

  it("uses the defaults until someone saves", async () => {
    expect((await loadTheme()).colors).toEqual(defaultTheme);
  });

  it("lets a branch admin save colours for the whole site, audited", async () => {
    const branch = await makeBranch("IND");
    const admin = await makeAdmin("BRANCH_ADMIN", branch.id);
    const colors = { ...defaultTheme, primary: "#c8102e" };

    const saved = await saveTheme(admin, colors);

    expect(saved.primary).toBe("#C8102E");
    const theme = await loadTheme();
    expect(theme.colors.primary).toBe("#C8102E");
    expect(theme.updatedBy).toMatch(/^Admin /);
    const log = await db.auditLog.findFirstOrThrow({ where: { action: "theme.update" } });
    expect(log.adminId).toBe(admin.id);
    expect((log.before as Record<string, string>).primary).toBe(defaultTheme.primary);
  });

  it("refuses unreadable combinations and leaves the live theme alone", async () => {
    const admin = await makeAdmin("SUPER_ADMIN", null);
    const err = await saveTheme(admin, { ...defaultTheme, accent: "#14142B" }).catch((e) => e);
    expect(err).toBeInstanceOf(DomainError);
    expect(err.code).toBe("LOW_CONTRAST");
    expect((await loadTheme()).colors).toEqual(defaultTheme);
  });

  it("refuses colours that aren't hex", async () => {
    const admin = await makeAdmin("SUPER_ADMIN", null);
    await expect(saveTheme(admin, { ...defaultTheme, ink: "black" })).rejects.toMatchObject({ code: "INVALID_THEME" });
  });
});
