import Link from "next/link";
import { Logo } from "@/components/logo";
import { requireAdmin } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { logoutAction } from "../actions-auth";
import { AdminNav } from "./admin-nav";

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const admin = await requireAdmin();
  const branch = admin.branchId ? await db.branch.findUnique({ where: { id: admin.branchId } }) : null;
  const items = [
    { href: "/admin", label: "Dashboard" },
    { href: "/admin/orders", label: "Orders" },
    { href: "/admin/products", label: "Products" },
    { href: "/admin/customers", label: "Customers" },
    { href: "/admin/payments", label: "Payments" },
    { href: "/admin/reports", label: "Reports" },
    { href: "/admin/theme", label: "Theme" },
    ...(admin.role === "SUPER_ADMIN" ? [{ href: "/admin/staff", label: "Staff" }] : []),
  ];
  return (
    <div className="flex min-h-screen flex-col bg-bone md:flex-row">
      <aside className="bg-ink text-paper [--logo-bg:var(--color-ink)] md:sticky md:top-0 md:h-screen md:w-60 md:shrink-0">
        <div className="flex items-center justify-between p-4 md:block md:p-6">
          <Link href="/admin"><Logo /></Link>
          <p className="label mt-0 text-ash md:mt-6">{admin.name}<br className="hidden md:block" /><span className="md:hidden"> · </span>{branch ? branch.name : "All branches"}</p>
        </div>
        <AdminNav items={items} />
        <form action={logoutAction} className="hidden p-6 md:block">
          <button className="label text-ash hover:text-paper">Sign out</button>
        </form>
      </aside>
      <div className="min-w-0 flex-1 p-4 md:p-8">{children}</div>
    </div>
  );
}
