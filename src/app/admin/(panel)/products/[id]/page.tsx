import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { publishProblems } from "@/lib/products";
import { duplicateAction, setStatusAction } from "../actions";
import { toFormValues } from "../form-values";
import { ProductForm } from "../product-form";

export default async function EditProductPage({ params, searchParams }: PageProps<"/admin/products/[id]">) {
  const admin = await requireAdmin();
  const sp = await searchParams;
  const product = await db.product.findUnique({
    where: { id: (await params).id },
    include: { images: { orderBy: { position: "asc" } }, variants: { orderBy: { size: "asc" } } },
  });
  if (!product || (admin.role === "BRANCH_ADMIN" && product.branchId !== admin.branchId)) notFound();
  const branches = await db.branch.findMany({ where: admin.branchId ? { id: admin.branchId } : {}, orderBy: { name: "asc" } });
  const problems = publishProblems(product);

  return (
    <div className="space-y-6">
      <Link href="/admin/products" className="label text-steel hover:underline">← Products</Link>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="display text-5xl">{product.title}</h1>
          <p className="label mt-1 text-steel">{product.sku} · {product.status.toLowerCase()}{product.status === "PUBLISHED" && <> · <Link href={`/product/${product.slug}`} className="underline" target="_blank">View on site</Link></>}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {product.status === "PUBLISHED" && (
            <form action={setStatusAction}>
              <input type="hidden" name="id" value={product.id} />
              <input type="hidden" name="status" value="HIDDEN" />
              <button className="btn btn-secondary">Hide from site</button>
            </form>
          )}
          {product.status === "HIDDEN" && (
            <form action={setStatusAction}>
              <input type="hidden" name="id" value={product.id} />
              <input type="hidden" name="status" value="PUBLISHED" />
              <button className="btn btn-secondary">Publish again</button>
            </form>
          )}
          <form action={duplicateAction}>
            <input type="hidden" name="id" value={product.id} />
            <button className="btn btn-secondary">Duplicate</button>
          </form>
        </div>
      </div>
      {sp.saved && <p className="border border-ink bg-paper p-3 text-sm" role="status">Saved.</p>}
      {typeof sp.error === "string" && <p className="border border-signal bg-paper p-3 text-sm text-signal" role="alert">{sp.error}</p>}
      {product.status !== "PUBLISHED" && product.status !== "SOLD" && problems.length > 0 && (
        <div className="bg-paper p-4 text-sm">
          <p className="field-label mb-1">Before this can be published</p>
          <ul className="list-disc pl-5">{problems.map((p) => <li key={p}>{p}</li>)}</ul>
        </div>
      )}
      <ProductForm id={product.id} initial={toFormValues(product)} branches={branches} lockBranch={admin.role === "BRANCH_ADMIN"} status={product.status} />
    </div>
  );
}
