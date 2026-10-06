"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import { cancelOrderByCustomer } from "@/lib/orders/decisions";
import { rateLimit } from "@/lib/rate-limit";

export async function cancelOrderAction(formData: FormData) {
  const orderId = String(formData.get("orderId"));
  const checkoutId = String(formData.get("checkoutId"));
  const token = String(formData.get("token"));
  let error = "";
  try {
    await cancelOrderByCustomer({ orderId, accessToken: token });
  } catch (err) {
    if (!(err instanceof DomainError)) throw err;
    error = err.message;
  }
  redirect(`/orders/${checkoutId}?t=${encodeURIComponent(token)}${error ? `&error=${encodeURIComponent(error)}` : "&cancelled=1"}`);
}

// Find an order by its number and the mobile number used at checkout.
export async function lookupOrderAction(_prev: { error: string; number?: string; phone?: string } | null, formData: FormData) {
  const number = String(formData.get("number") ?? "").trim().toUpperCase();
  const rawPhone = String(formData.get("phone") ?? "");
  const phone = rawPhone.replace(/\D/g, "").slice(-10);
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0] ?? "local";
  if (!rateLimit(`lookup:${ip}`, 10, 10 * 60_000)) return { error: "Too many attempts. Try again in a few minutes.", number, phone: rawPhone };
  const order = await db.order.findUnique({ where: { number }, include: { customer: true, checkout: true } });
  if (!order || order.customer.phone !== phone) {
    return { error: "We couldn't find an order with that number and mobile.", number, phone: rawPhone };
  }
  redirect(`/orders/${order.checkoutId}?t=${encodeURIComponent(order.checkout.accessToken)}`);
}
