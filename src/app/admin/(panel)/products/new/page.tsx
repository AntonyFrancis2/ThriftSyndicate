import Link from "next/link";
import { requireAdmin } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { emptyFormValues } from "../form-values";
import { ProductForm } from "../product-form";

export default async function NewProductPage() {
  const admin = await requireAdmin();
  const branches = await db.branch.findMany({ where: admin.branchId ? { id: admin.branchId } : {}, orderBy: { name: "asc" } });
  return (
    <div className="space-y-6">
      <Link href="/admin/products" className="label text-steel hover:underline">← Products</Link>
      <h1 className="display text-5xl">Add product</h1>
      <ProductForm id={null} initial={emptyFormValues(branches[0].id)} branches={branches} lockBranch={admin.role === "BRANCH_ADMIN"} />
    </div>
  );
}
