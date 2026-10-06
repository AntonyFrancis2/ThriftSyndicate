import { notFound } from "next/navigation";
import { Invoice } from "@/components/invoice";
import { PrintButton } from "@/components/print-button";
import { requireAdmin } from "@/lib/auth/session";
import { db } from "@/lib/db";

// Printable packing slip and GST invoice for staff (PRD §7.3).
export default async function AdminPrintPage({ params, searchParams }: PageProps<"/admin/print/[id]">) {
  const admin = await requireAdmin();
  const doc = (await searchParams).doc === "invoice" ? "invoice" : "packing-slip";
  const order = await db.order.findUnique({
    where: { id: (await params).id },
    include: { branch: true, customer: true, items: { include: { variant: { include: { product: true } } } } },
  });
  if (!order || (admin.role === "BRANCH_ADMIN" && order.branchId !== admin.branchId)) notFound();
  return (
    <>
      <PrintButton />
      <Invoice
        kind={doc}
        order={{
          ...order,
          items: order.items.map((i) => ({ ...i, category: i.variant.product.category, sku: i.variant.product.sku, rackLocation: i.variant.product.rackLocation })),
        }}
      />
    </>
  );
}
