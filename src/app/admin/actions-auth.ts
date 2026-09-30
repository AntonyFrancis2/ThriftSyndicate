"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { checkPassword } from "@/lib/auth/password";
import { endAdminSession, startAdminSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";

// A real bcrypt hash of a random string, so unknown emails take as long as wrong passwords.
const DUMMY_HASH = "$2b$12$br6Y9Z2W.tJ1lq4pLJtW2evEl/gROHNfjt8ojXq8KC7VgsCN4GsOi";

// Rate-limited per IP and per email (PRD §12). Two-factor login is a follow-up (PRD §7.9).
export async function loginAction(_prev: { error: string; email?: string } | null, formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0] ?? "local";
  if (!rateLimit(`login:ip:${ip}`, 20, 15 * 60_000) || !rateLimit(`login:email:${email}`, 5, 15 * 60_000)) {
    return { error: "Too many attempts. Wait 15 minutes and try again.", email };
  }
  const admin = await db.adminUser.findUnique({ where: { email } });
  // Compare even when the user doesn't exist so timing doesn't reveal valid emails.
  const ok = await checkPassword(password, admin?.passwordHash ?? DUMMY_HASH);
  if (!admin || !admin.active || !ok) return { error: "Wrong email or password.", email };

  await startAdminSession(admin.id);
  const next = String(formData.get("next") ?? "");
  redirect(next.startsWith("/admin") ? next : "/admin");
}

export async function logoutAction() {
  await endAdminSession();
  redirect("/admin/login");
}
