import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Invoice } from "@/components/invoice";
import { PrintButton } from "@/components/print-button";
import { db } from "@/lib/db";
import { getCheckoutForCustomer } from "@/lib/orders/queries";

export const metadata: Metadata = { title: "Invoice", robots: { index: false } };

export default async function CustomerInvoicePage({ params, searchParams }: PageProps<"/invoice/[orderId]">) {
  const { orderId } = await params;
  const token = (await searchParams).t;
  const order = await db.order.findUnique({
    where: { id: orderId },
    include: { branch: true, customer: true, items: { include: { variant: { include: { product: true } } } } },
  });
  if (!order || !(await getCheckoutForCustomer(order.checkoutId, typeof token === "string" ? token : undefined))) notFound();
  if (["PENDING_PAYMENT", "REJECTED", "CANCELLED", "EXPIRED"].includes(order.status)) notFound();

  return (
    <>
      <PrintButton />
      <Invoice
        kind="invoice"
        order={{ ...order, items: order.items.map((i) => ({ ...i, category: i.variant.product.category })) }}
      />
    </>
  );
}
