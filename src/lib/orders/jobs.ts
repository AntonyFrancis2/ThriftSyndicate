import { storeConfig } from "@/lib/config";
import { db } from "@/lib/db";
import { deliverPending } from "@/lib/notifications/deliver";
import { notify } from "@/lib/notify";
import { rejectOrder } from "./decisions";

const HOUR = 3_600_000;

// Runs every few minutes from /api/cron/sweep.
export async function runScheduledJobs(now = new Date()) {
  return {
    expiredCheckouts: await expireUnpaidCheckouts(now),
    escalated: await escalateSlowApprovals(now),
    autoRejected: await autoRejectOverdue(now),
    // Last, so messages written by the jobs above go out in the same run.
    notifications: await deliverPending({ limit: 100 }),
  };
}

// BR5: unpaid checkouts give their items back after the reservation window.
// A payment that still arrives later is handled in recordPayment (items re-claimed or refunded).
export async function expireUnpaidCheckouts(now = new Date()) {
  const stale = await db.checkout.findMany({
    where: { status: "PENDING_PAYMENT", reservationExpiresAt: { lt: now } },
    select: { id: true },
  });
  for (const { id } of stale) {
    await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Checkout" WHERE id = ${id} FOR UPDATE`;
      const c = await tx.checkout.findUniqueOrThrow({ where: { id } });
      if (c.status !== "PENDING_PAYMENT") return; // paid meanwhile
      await tx.reservation.updateMany({ where: { checkoutId: id, status: "HELD" }, data: { status: "RELEASED" } });
      await tx.checkout.update({ where: { id }, data: { status: "EXPIRED" } });
      await tx.order.updateMany({ where: { checkoutId: id, status: "PENDING_PAYMENT" }, data: { status: "EXPIRED" } });
    });
  }
  return stale.length;
}

// BR4: at 24 hours without a decision, alert the super admins once.
export async function escalateSlowApprovals(now = new Date()) {
  const cutoff = new Date(now.getTime() - storeConfig.approvalAlertHours * HOUR);
  const orders = await db.order.findMany({
    where: { status: "AWAITING_APPROVAL", paidAt: { lt: cutoff }, escalatedAt: null },
    include: { branch: true },
  });
  if (orders.length === 0) return 0;
  const admins = await db.adminUser.findMany({ where: { role: "SUPER_ADMIN", active: true } });
  for (const order of orders) {
    for (const a of admins) {
      await notify({
        channel: "admin",
        to: a.email,
        template: "admin_approval_overdue",
        payload: { orderNumber: order.number, branch: order.branch.name, paidAt: order.paidAt },
        orderId: order.id,
      });
    }
    await db.order.update({ where: { id: order.id }, data: { escalatedAt: now } });
  }
  return orders.length;
}

// BR4: at 48 hours, auto-reject and refund in full.
export async function autoRejectOverdue(now = new Date()) {
  const cutoff = new Date(now.getTime() - storeConfig.approvalDeadlineHours * HOUR);
  const orders = await db.order.findMany({
    where: { status: "AWAITING_APPROVAL", paidAt: { lt: cutoff } },
    select: { id: true },
  });
  let count = 0;
  for (const { id } of orders) {
    try {
      await rejectOrder({ orderId: id, reason: "AUTO_TIMEOUT", actor: { kind: "system" } });
      count++;
    } catch (err) {
      // Someone decided at the same moment; their decision stands.
      console.warn(`auto-reject skipped for ${id}:`, err);
    }
  }
  return count;
}
