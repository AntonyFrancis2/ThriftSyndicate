import "server-only";
import { jwtVerify, SignJWT } from "jose";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import type { AdminActor } from "@/lib/orders/decisions";

const COOKIE = "ts_admin";
const SESSION_HOURS = 12;

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET must be set (32+ characters)");
  return new TextEncoder().encode(s);
}

export async function signAdminToken(adminId: string) {
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(adminId)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_HOURS}h`)
    .sign(secret());
}

export async function verifyAdminToken(token: string | undefined): Promise<string | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ["HS256"] });
    return payload.sub ?? null;
  } catch {
    return null;
  }
}

export async function startAdminSession(adminId: string) {
  const jar = await cookies();
  jar.set(COOKIE, await signAdminToken(adminId), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_HOURS * 3600,
  });
}

export async function endAdminSession() {
  (await cookies()).delete(COOKIE);
}

export interface SessionAdmin extends AdminActor {
  name: string;
  email: string;
}

// The signed-in admin, re-read from the database on every request so deactivation takes effect at once.
export async function getAdmin(): Promise<SessionAdmin | null> {
  const id = await verifyAdminToken((await cookies()).get(COOKIE)?.value);
  if (!id) return null;
  const admin = await db.adminUser.findUnique({ where: { id } });
  if (!admin || !admin.active) return null;
  return { kind: "admin", id: admin.id, role: admin.role, branchId: admin.branchId, name: admin.name, email: admin.email };
}

export async function requireAdmin(): Promise<SessionAdmin> {
  const admin = await getAdmin();
  if (!admin) redirect("/admin/login");
  return admin;
}

export async function requireSuperAdmin(): Promise<SessionAdmin> {
  const admin = await requireAdmin();
  if (admin.role !== "SUPER_ADMIN") redirect("/admin");
  return admin;
}

// Branch filter for queries: branch admins see only their branch (PRD §3).
export function branchScope(admin: AdminActor, requestedBranchId?: string | null) {
  if (admin.role === "BRANCH_ADMIN") return { branchId: admin.branchId! };
  return requestedBranchId ? { branchId: requestedBranchId } : {};
}

export const ADMIN_COOKIE = COOKIE;
