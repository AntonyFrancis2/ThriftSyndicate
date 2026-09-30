import type { Tx } from "@/lib/db";
import { db } from "@/lib/db";

// Customer and staff messages (PRD §6.9). Every message is recorded; email/SMS/WhatsApp
// providers (Resend, MSG91) are wired in later by reading this table or replacing send().
export type Template =
  | "order_placed"
  | "order_approved"
  | "order_rejected"
  | "order_cancelled"
  | "order_shipped"
  | "order_ready_for_pickup"
  | "order_delivered"
  | "admin_approval_overdue"
  | "admin_refund_failed"
  | "admin_payment_mismatch";

export async function notify(
  input: { channel: "email" | "sms" | "whatsapp" | "admin"; to: string; template: Template; payload: Record<string, unknown>; orderId?: string },
  tx: Tx = db,
) {
  await tx.notification.create({
    data: { channel: input.channel, to: input.to, template: input.template, payload: input.payload as object, orderId: input.orderId },
  });
  if (process.env.NODE_ENV === "development") {
    console.info(`[notify:${input.channel}] ${input.template} → ${input.to}`);
  }
}

// Email + SMS to the customer for an order event.
export async function notifyCustomer(
  order: { id: string; number: string; customer: { email: string; phone: string } },
  template: Template,
  payload: Record<string, unknown> = {},
  tx: Tx = db,
) {
  const data = { orderNumber: order.number, ...payload };
  await notify({ channel: "email", to: order.customer.email, template, payload: data, orderId: order.id }, tx);
  if (template !== "order_delivered") {
    await notify({ channel: "sms", to: order.customer.phone, template, payload: data, orderId: order.id }, tx);
  }
}
