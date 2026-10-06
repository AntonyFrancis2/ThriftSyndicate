import { siteUrl, storeConfig } from "@/lib/config";
import { formatINR } from "@/lib/money";
import type { Template } from "@/lib/notify";

// The words of every message. Email gets subject + text + HTML. SMS (DLT) and WhatsApp templates are
// registered with fixed wording and filled with `vars` in this order — DEPLOY.md lists the text to register.
export interface Message {
  subject: string;
  text: string;
  vars: string[];
}

type Payload = Record<string, unknown>;

const str = (v: unknown) => (v === null || v === undefined ? "" : String(v));
const money = (v: unknown) => (typeof v === "number" ? formatINR(v) : str(v));

const builders: Record<Template, (p: Payload, track: string) => Message> = {
  order_placed: (p, track) => ({
    subject: `Order ${str(p.orderNumber)} placed — we're checking your pieces`,
    text: `Thanks for your order ${str(p.orderNumber)}. We've received your payment of ${money(p.totalPaise)}.\n\nThe store checks every piece by hand and confirms within ${storeConfig.approvalAlertHours} hours. If we can't confirm it, you get a full refund automatically.\n\nTrack your order: ${track}`,
    vars: [str(p.orderNumber), money(p.totalPaise)],
  }),
  order_approved: (p, track) => ({
    subject: `Order ${str(p.orderNumber)} confirmed`,
    text: `Good news: order ${str(p.orderNumber)} is confirmed and being packed. We'll message you again when it's on its way.\n\nTrack your order: ${track}`,
    vars: [str(p.orderNumber)],
  }),
  order_rejected: (p, track) => ({
    subject: `Order ${str(p.orderNumber)} couldn't be confirmed — full refund issued`,
    text: `Sorry — we couldn't confirm order ${str(p.orderNumber)}${p.reason ? ` (${str(p.reason)})` : ""}. A full refund of ${money(p.refundPaise)} is on its way to your original payment method and usually arrives in 5–7 working days.\n\nOrder details: ${track}`,
    vars: [str(p.orderNumber), money(p.refundPaise)],
  }),
  order_cancelled: (p, track) => ({
    subject: `Order ${str(p.orderNumber)} cancelled`,
    text: `Order ${str(p.orderNumber)} is cancelled. A full refund of ${money(p.refundPaise)} is on its way to your original payment method and usually arrives in 5–7 working days.\n\nOrder details: ${track}`,
    vars: [str(p.orderNumber), money(p.refundPaise)],
  }),
  order_shipped: (p, track) => ({
    subject: `Order ${str(p.orderNumber)} is on its way`,
    text: `Order ${str(p.orderNumber)} has shipped with ${str(p.courier)}, AWB ${str(p.awb)}.${p.trackingUrl ? `\n\nTrack the parcel: ${str(p.trackingUrl)}` : ""}\n\nOrder details: ${track}`,
    vars: [str(p.orderNumber), str(p.courier), str(p.awb)],
  }),
  order_ready_for_pickup: (p, track) => ({
    subject: `Order ${str(p.orderNumber)} is ready for pickup`,
    text: `Order ${str(p.orderNumber)} is ready to collect. Show this pickup code at the store: ${str(p.pickupOtp)}\n\nOrder details: ${track}`,
    vars: [str(p.orderNumber), str(p.pickupOtp)],
  }),
  order_delivered: (p, track) => ({
    subject: `Order ${str(p.orderNumber)} delivered`,
    text: `Order ${str(p.orderNumber)} has been delivered. Enjoy it — and thanks for shopping one-of-one.\n\nOrder details: ${track}`,
    vars: [str(p.orderNumber)],
  }),
  admin_approval_overdue: (p) => ({
    subject: `Order ${str(p.orderNumber)} has waited ${storeConfig.approvalAlertHours}h for approval`,
    text: `Order ${str(p.orderNumber)} at ${str(p.branch)} has not been approved or rejected. It is refunded automatically at ${storeConfig.approvalDeadlineHours} hours.\n\n${siteUrl()}/admin/orders?status=AWAITING_APPROVAL`,
    vars: [str(p.orderNumber), str(p.branch)],
  }),
  admin_refund_failed: (p) => ({
    subject: `Refund failed on order ${str(p.orderNumber)}`,
    text: `A refund of ${money(p.amountPaise)} on order ${str(p.orderNumber)} failed: ${str(p.error)}\n\nRetry it from ${siteUrl()}/admin/payments`,
    vars: [str(p.orderNumber), money(p.amountPaise)],
  }),
  admin_payment_mismatch: (p) => ({
    subject: "Payment check needs a look",
    text: `${str(p.problem) || "A payment didn't match its order."} Razorpay order ${str(p.razorpayOrderId)}${p.razorpayPaymentId ? `, payment ${str(p.razorpayPaymentId)}` : ""}: paid ${money(p.paidPaise)}, expected ${money(p.expectedPaise)}.\n\n${siteUrl()}/admin/payments`,
    vars: [str(p.razorpayOrderId), money(p.paidPaise)],
  }),
};

export function renderMessage(template: Template, payload: Payload): Message {
  return builders[template](payload, `${siteUrl()}/orders`);
}

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

// Plain, brand-neutral email HTML: paragraphs from the text, links made clickable.
export function emailHtml(message: Message): string {
  const body = message.text
    .split("\n\n")
    .map((para) => `<p style="margin:0 0 16px">${escapeHtml(para).replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" style="color:#2B44E0">$1</a>').replace(/\n/g, "<br>")}</p>`)
    .join("");
  return `<!doctype html><html><body style="margin:0;padding:24px;background:#F1F3FF;font-family:Helvetica,Arial,sans-serif;color:#14142B;font-size:15px;line-height:1.5"><div style="max-width:560px;margin:0 auto;background:#ffffff;padding:32px"><p style="margin:0 0 24px;font-weight:bold;letter-spacing:.2em;text-transform:uppercase">${escapeHtml(storeConfig.name)}</p>${body}<p style="margin:24px 0 0;font-size:12px;color:#5F5F6F">All sales final · No returns or exchanges</p></div></body></html>`;
}
