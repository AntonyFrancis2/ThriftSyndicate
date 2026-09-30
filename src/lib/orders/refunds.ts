import { storeConfig } from "@/lib/config";
import { db } from "@/lib/db";
import { notify } from "@/lib/notify";
import { getGateway } from "@/lib/payments";

// Refunds part or all of an order through the Razorpay Refunds API (PRD §8.3).
// Called after the order's status change has committed, so a Razorpay outage never undoes a rejection;
// a failed refund is recorded as FAILED and the super admins are alerted to retry.
export async function refundOrder(input: {
  orderId: string;
  amountPaise?: number; // default: everything not yet refunded
  reason: string;
  adminId?: string | null;
}) {
  const order = await db.order.findUniqueOrThrow({
    where: { id: input.orderId },
    include: {
      refunds: { where: { status: { not: "FAILED" } } },
      checkout: { include: { payments: { where: { status: "CAPTURED" } } } },
    },
  });
  const payment = order.checkout.payments[0];
  if (!payment) return null; // never paid: nothing to refund

  const alreadyRefunded = order.refunds.reduce((s, r) => s + r.amountPaise, 0);
  const refundable = order.totalPaise - alreadyRefunded;
  const amountPaise = Math.min(input.amountPaise ?? refundable, refundable);
  if (amountPaise <= 0) return null;

  const refund = await db.refund.create({
    data: {
      paymentId: payment.id,
      orderId: order.id,
      amountPaise,
      reason: input.reason,
      createdById: input.adminId ?? null,
    },
  });

  try {
    const result = await getGateway().refund({
      paymentId: payment.razorpayPaymentId,
      amountPaise,
      reason: input.reason,
      instant: storeConfig.instantRefunds,
    });
    return await db.$transaction(async (tx) => {
      const updated = await tx.refund.update({
        where: { id: refund.id },
        data: { razorpayRefundId: result.id, status: result.status === "processed" ? "PROCESSED" : "PENDING" },
      });
      await tx.order.update({ where: { id: order.id }, data: { refundedPaise: { increment: amountPaise } } });
      return updated;
    });
  } catch (err) {
    await db.refund.update({ where: { id: refund.id }, data: { status: "FAILED" } });
    const admins = await db.adminUser.findMany({ where: { role: "SUPER_ADMIN", active: true } });
    for (const a of admins) {
      await notify({
        channel: "admin",
        to: a.email,
        template: "admin_refund_failed",
        payload: { orderNumber: order.number, amountPaise, error: String(err) },
        orderId: order.id,
      });
    }
    return null;
  }
}
