import { revalidatePath } from "next/cache";
import { ConfirmButton } from "@/components/confirm-button";
import { branchScope, requireAdmin } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { formatINR } from "@/lib/money";

async function toggleBlock(formData: FormData) {
  "use server";
  const admin = await requireAdmin();
  const id = String(formData.get("id"));
  const blocked = formData.get("blocked") === "1";
  await db.customer.update({ where: { id }, data: { blocked } });
  await db.auditLog.create({ data: { adminId: admin.id, action: blocked ? "customer.block" : "customer.unblock", entity: "Customer", entityId: id } });
  revalidatePath("/admin/customers");
}

async function saveNote(formData: FormData) {
  "use server";
  await requireAdmin();
  await db.customer.update({ where: { id: String(formData.get("id")) }, data: { notes: String(formData.get("notes") ?? "").slice(0, 1000) } });
  revalidatePath("/admin/customers");
}

export default async function CustomersPage({ searchParams }: PageProps<"/admin/customers">) {
  const admin = await requireAdmin();
  const q = (await searchParams).q;
  const query = typeof q === "string" ? q.trim() : "";
  const scope = branchScope(admin);
  // Branch admins see customers who have ordered from their branch.
  const customers = await db.customer.findMany({
    where: {
      ...(admin.role === "BRANCH_ADMIN" ? { orders: { some: scope } } : {}),
      ...(query ? { OR: [{ name: { contains: query, mode: "insensitive" } }, { phone: { contains: query } }, { email: { contains: query, mode: "insensitive" } }] } : {}),
    },
    include: {
      orders: {
        where: { ...scope, status: { notIn: ["PENDING_PAYMENT", "EXPIRED"] } },
        select: { totalPaise: true, refundedPaise: true, status: true, createdAt: true },
        orderBy: { createdAt: "desc" },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="display text-5xl">Customers</h1>
        <form><input name="q" defaultValue={query} placeholder="Name, phone or email" className="field w-60 py-1 text-sm" aria-label="Search customers" /></form>
      </div>
      <div className="overflow-x-auto bg-paper">
        <table className="w-full min-w-[800px] text-sm">
          <thead>
            <tr className="field-label border-b border-ink text-left">
              <th className="p-3">Customer</th><th>Orders</th><th className="text-right">Spend (net)</th><th>Last order</th><th>Notes</th><th className="pr-3" />
            </tr>
          </thead>
          <tbody>
            {customers.map((c) => {
              const spend = c.orders.reduce((s, o) => s + o.totalPaise - o.refundedPaise, 0);
              return (
                <tr key={c.id} className="border-b border-mist align-top">
                  <td className="p-3">{c.name}{c.blocked && <span className="tag ml-2 text-signal">Blocked</span>}<br /><span className="label text-steel">{c.phone} · {c.email}</span></td>
                  <td className="label pt-3">{c.orders.length}</td>
                  <td className="label pt-3 text-right">{formatINR(spend)}</td>
                  <td className="label pt-3">{c.orders[0]?.createdAt.toLocaleDateString("en-IN") ?? "—"}</td>
                  <td className="pt-2">
                    <form action={saveNote} className="flex gap-2">
                      <input type="hidden" name="id" value={c.id} />
                      <input name="notes" defaultValue={c.notes} className="field py-1 text-sm" aria-label={`Notes for ${c.name}`} />
                      <button className="label underline">Save</button>
                    </form>
                  </td>
                  <td className="pr-3 pt-2 text-right">
                    <form action={toggleBlock}>
                      <input type="hidden" name="id" value={c.id} />
                      <input type="hidden" name="blocked" value={c.blocked ? "0" : "1"} />
                      <ConfirmButton message={c.blocked ? `Unblock ${c.name}?` : `Block ${c.name} from ordering online?`} className="label border border-ink px-2 py-1 hover:bg-ink hover:text-paper">
                        {c.blocked ? "Unblock" : "Block"}
                      </ConfirmButton>
                    </form>
                  </td>
                </tr>
              );
            })}
            {customers.length === 0 && <tr><td colSpan={6} className="p-8 text-center text-graphite">No customers yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
