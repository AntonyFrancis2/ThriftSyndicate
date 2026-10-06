import Link from "next/link";
import { Suspense } from "react";
import { ConfirmButton } from "@/components/confirm-button";
import type { ProductStatus } from "@/generated/prisma/enums";
import { branchScope, requireAdmin } from "@/lib/auth/session";
import { categoryLabel, conditionLabel } from "@/lib/catalog";
import { db } from "@/lib/db";
import { formatINR } from "@/lib/money";
import { activeReservationWhere } from "@/lib/orders/inventory";
import { BranchSwitcher } from "../branch-switcher";
import { markSoldAction } from "./actions";

const statuses: (ProductStatus | "ALL")[] = ["PUBLISHED", "DRAFT", "HIDDEN", "SOLD", "ALL"];

export default async function ProductsPage({ searchParams }: PageProps<"/admin/products">) {
  const admin = await requireAdmin();
  const sp = await searchParams;
  const status = (typeof sp.status === "string" ? sp.status : "PUBLISHED") as ProductStatus | "ALL";
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const scope = branchScope(admin, typeof sp.branch === "string" ? sp.branch : null);

  const products = await db.product.findMany({
    where: {
      ...scope,
      ...(status === "ALL" ? {} : { status }),
      ...(q ? { OR: [{ title: { contains: q, mode: "insensitive" } }, { sku: { contains: q, mode: "insensitive" } }, { brand: { contains: q, mode: "insensitive" } }] } : {}),
    },
    orderBy: { updatedAt: "desc" },
    include: {
      images: { orderBy: { position: "asc" }, take: 1 },
      branch: true,
      variants: { include: { reservations: { where: activeReservationWhere() } } },
    },
    take: 200,
  });
  const branches = admin.role === "SUPER_ADMIN" ? await db.branch.findMany({ orderBy: { name: "asc" } }) : [];
  const back = `/admin/products?status=${status}${q ? `&q=${encodeURIComponent(q)}` : ""}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="display text-5xl">Products</h1>
        <div className="flex flex-wrap items-end gap-4">
          <form className="flex items-end gap-2">
            <input type="hidden" name="status" value={status} />
            <input name="q" defaultValue={q} placeholder="Title, SKU or brand" className="field w-52 py-1 text-sm" aria-label="Search products" />
          </form>
          {branches.length > 0 && <Suspense><BranchSwitcher branches={branches} /></Suspense>}
          <Link href="/admin/products/new" className="btn btn-primary">Add product</Link>
        </div>
      </div>
      {typeof sp.error === "string" && <p className="border border-signal bg-paper p-3 text-sm text-signal" role="alert">{sp.error}</p>}

      <nav className="flex gap-1 overflow-x-auto">
        {statuses.map((s) => (
          <Link key={s} href={`/admin/products?status=${s}`} className={`label px-3 py-2 ${status === s ? "bg-primary text-paper" : "bg-paper hover:bg-mist"}`}>
            {s === "ALL" ? "All" : s.charAt(0) + s.slice(1).toLowerCase()}
          </Link>
        ))}
      </nav>

      <div className="overflow-x-auto bg-paper">
        <table className="w-full min-w-[900px] text-sm">
          <thead>
            <tr className="field-label border-b border-ink text-left">
              <th className="p-3">Product</th>
              <th>SKU / rack</th>
              {admin.role === "SUPER_ADMIN" && <th>Branch</th>}
              <th>Condition</th>
              <th className="text-right">Price</th>
              <th>Stock</th>
              <th className="pr-3 text-right">In-store sale</th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id} className="border-b border-mist hover:bg-bone">
                <td className="p-3">
                  <Link href={`/admin/products/${p.id}`} className="flex items-center gap-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.images[0]?.url ?? ""} alt="" className="aspect-[4/5] w-10 bg-bone object-cover" />
                    <span>
                      <span className="underline-offset-4 hover:underline">{p.title}</span>
                      <span className="label block text-steel">{categoryLabel[p.category]} · {p.era === "RETRO" ? "Retro" : "Latest"} · {p.status.toLowerCase()}</span>
                    </span>
                  </Link>
                </td>
                <td className="label">{p.sku}<br /><span className="text-steel">{p.rackLocation ?? "—"}</span></td>
                {admin.role === "SUPER_ADMIN" && <td>{p.branch.name}</td>}
                <td><span className="tag">{conditionLabel[p.condition]}</span></td>
                <td className="label text-right">{formatINR(p.pricePaise)}</td>
                <td className="label">
                  {p.variants.map((v) => {
                    const held = v.reservations.reduce((s, r) => s + r.quantity, 0);
                    return <span key={v.id} className="mr-2 inline-block">{v.size}: {v.stockQty}{held ? ` (${held} held)` : ""}</span>;
                  })}
                </td>
                <td className="pr-3 text-right">
                  {p.status !== "SOLD" && (
                    <div className="flex flex-wrap justify-end gap-1">
                      {p.variants.filter((v) => v.stockQty > 0).map((v) => (
                        <form key={v.id} action={markSoldAction}>
                          <input type="hidden" name="variantId" value={v.id} />
                          <input type="hidden" name="back" value={back} />
                          <ConfirmButton message={`Mark one ${v.size} of "${p.title}" as sold in store?`} className="label border border-ink px-2 py-1 hover:bg-ink hover:text-paper">
                            Sold {p.variants.length > 1 ? v.size : ""}
                          </ConfirmButton>
                        </form>
                      ))}
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {products.length === 0 && <tr><td colSpan={7} className="p-8 text-center text-graphite">No products here.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
