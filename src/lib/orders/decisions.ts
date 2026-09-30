import { randomInt } from "node:crypto";
import type { OrderStatus, RejectionReason } from "@/generated/prisma/enums";
import type { Tx } from "@/lib/db";
import { db } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import { notifyCustomer, type Template } from "@/lib/notify";
import { consumeStock, markSoldIfEmpty } from "./inventory";
import { refundOrder } from "./refunds";
import { canTransition, rejectionReasonLabel } from "./status";

export interface AdminActor {
  kind: "admin";
  id: string;
  role: "SUPER_ADMIN" | "BRANCH_ADMIN";
  branchId: string | null;
}
export type Actor = AdminActor | { kind: "system" } | { kind: "customer" };

// Branch admins act only on their own branch (PRD §3).
export function assertBranchAccess(actor: AdminActor, branchId: string) {
  if (actor.role !== "SUPER_ADMIN" && actor.branchId !== branchId) {
    throw new DomainError("FORBIDDEN", "This order belongs to another branch.");
  }
}

async function lockOrder(tx: Tx, orderId: string) {
  await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${orderId} FOR UPDATE`;
  const order = await tx.order.findUnique({
    where: { id: orderId },
    include: { items: true, customer: true, checkout: { include: { reservations: true } } },
  });
  if (!order) throw new DomainError("NOT_FOUND", "Order not found.");
  return order;
}

async function audit(tx: Tx, actor: Actor, action: string, entityId: string, before: unknown, after: unknown) {
  await tx.auditLog.create({
    data: {
      adminId: actor.kind === "admin" ? actor.id : null,
      action,
      entity: "Order",
      entityId,
      before: before as object,
      after: after as object,
    },
  });
}

export async function setFoundOnRack(input: { orderItemId: string; found: boolean; actor: AdminActor }) {
  return db.$transaction(async (tx) => {
    const item = await tx.orderItem.findUnique({ where: { id: input.orderItemId }, include: { order: true } });
    if (!item) throw new DomainError("NOT_FOUND", "Item not found.");
    assertBranchAccess(input.actor, item.order.branchId);
    if (item.order.status !== "AWAITING_APPROVAL") {
      throw new DomainError("INVALID_STATE", "This order is no longer awaiting approval.");
    }
    return tx.orderItem.update({ where: { id: item.id }, data: { foundOnRack: input.found } });
  });
}

// Approve: enabled only once every item is ticked "Found on rack" (PRD §7.2).
export async function approveOrder(input: { orderId: string; actor: AdminActor }) {
  const order = await db.$transaction(async (tx) => {
    const order = await lockOrder(tx, input.orderId);
    assertBranchAccess(input.actor, order.branchId);
    if (!canTransition(order.status, "CONFIRMED")) {
      throw new DomainError("INVALID_STATE", `Order is ${order.status.toLowerCase().replaceAll("_", " ")}, not awaiting approval.`);
    }
    const active = order.items.filter((i) => i.status === "ACTIVE");
    if (active.some((i) => !i.foundOnRack)) {
      throw new DomainError("ITEMS_NOT_FOUND", "Tick every item as found on the rack before approving.");
    }

    // The held units now leave stock for good.
    for (const item of active) {
      const reservation = order.checkout.reservations.find((r) => r.variantId === item.variantId && r.status === "HELD");
      if (!reservation) throw new Error(`No held reservation for item ${item.id}`);
      await tx.reservation.update({ where: { id: reservation.id }, data: { status: "CONSUMED" } });
      await consumeStock(tx, item.variantId, item.quantity);
    }

    const now = new Date();
    const updated = await tx.order.update({
      where: { id: order.id },
      data: {
        status: "CONFIRMED",
        approvedById: input.actor.id,
        approvedAt: now,
        decidedAt: now,
        events: { create: { status: "CONFIRMED", message: "Confirmed by the store. Your order is being packed.", actorId: input.actor.id } },
      },
    });
    await audit(tx, input.actor, "order.approve", order.id, { status: order.status }, { status: "CONFIRMED" });
    await notifyCustomer(order, "order_approved", {}, tx);
    return updated;
  });
  return order;
}

// What happens to stock on rejection (PRD §7.2: "stock is released or marked sold").
async function applyRejectionToStock(tx: Tx, reason: RejectionReason, variantIds: string[]) {
  const variants = await tx.productVariant.findMany({ where: { id: { in: variantIds } } });
  for (const v of variants) {
    if (reason === "SOLD_IN_STORE") {
      await tx.productVariant.update({ where: { id: v.id }, data: { stockQty: 0 } });
      await markSoldIfEmpty(tx, v.productId);
    } else if (reason === "DAMAGED" || reason === "CANNOT_LOCATE") {
      // Off the site until staff check it.
      await tx.product.update({ where: { id: v.productId }, data: { status: "HIDDEN" } });
    }
  }
}

// Reject (admin, 48-hour timeout, or item gone at payment): full refund of the order (BR3, BR4).
export async function rejectOrder(input: { orderId: string; reason: RejectionReason; note?: string; actor: AdminActor | { kind: "system" } }) {
  if (input.actor.kind === "admin" && (input.reason === "AUTO_TIMEOUT" || input.reason === "NOT_AVAILABLE_AT_PAYMENT")) {
    throw new DomainError("INVALID_REASON", "Choose a rejection reason.");
  }
  if (input.reason === "OTHER" && !input.note?.trim()) {
    throw new DomainError("NOTE_REQUIRED", "Add a note explaining the rejection.");
  }

  const order = await db.$transaction(async (tx) => {
    const order = await lockOrder(tx, input.orderId);
    if (input.actor.kind === "admin") assertBranchAccess(input.actor, order.branchId);
    if (!canTransition(order.status, "REJECTED")) {
      throw new DomainError("INVALID_STATE", "Only orders awaiting approval can be rejected.");
    }

    const variantIds = order.items.map((i) => i.variantId);
    await tx.reservation.updateMany({
      where: { checkoutId: order.checkoutId, variantId: { in: variantIds }, status: "HELD" },
      data: { status: "RELEASED" },
    });
    await applyRejectionToStock(tx, input.reason, variantIds);

    const updated = await tx.order.update({
      where: { id: order.id },
      data: {
        status: "REJECTED",
        rejectionReason: input.reason,
        rejectionNote: input.note?.trim() || null,
        decidedAt: new Date(),
        events: {
          create: {
            status: "REJECTED",
            message: "Order not accepted. Your full refund is on its way.",
            actorId: input.actor.kind === "admin" ? input.actor.id : null,
          },
        },
      },
    });
    await audit(tx, input.actor, "order.reject", order.id, { status: order.status }, {
      status: "REJECTED",
      reason: input.reason,
      note: input.note,
    });
    await notifyCustomer(order, "order_rejected", { reason: rejectionReasonLabel[input.reason], refundPaise: order.totalPaise }, tx);
    return updated;
  });

  await refundOrder({
    orderId: order.id,
    reason: `Rejected: ${rejectionReasonLabel[input.reason]}`,
    adminId: input.actor.kind === "admin" ? input.actor.id : null,
  });
  return order;
}

// BR8: the customer may cancel only while the order is awaiting approval; full refund.
export async function cancelOrderByCustomer(input: { orderId: string; accessToken: string }) {
  const order = await db.$transaction(async (tx) => {
    const order = await lockOrder(tx, input.orderId);
    if (order.checkout.accessToken !== input.accessToken) throw new DomainError("NOT_FOUND", "Order not found.");
    if (!canTransition(order.status, "CANCELLED")) {
      throw new DomainError("INVALID_STATE", "This order can no longer be cancelled.");
    }
    await tx.reservation.updateMany({
      where: { checkoutId: order.checkoutId, variantId: { in: order.items.map((i) => i.variantId) }, status: "HELD" },
      data: { status: "RELEASED" },
    });
    const updated = await tx.order.update({
      where: { id: order.id },
      data: {
        status: "CANCELLED",
        decidedAt: new Date(),
        events: { create: { status: "CANCELLED", message: "Cancelled by you. Your full refund is on its way." } },
      },
    });
    await audit(tx, { kind: "customer" }, "order.cancel", order.id, { status: order.status }, { status: "CANCELLED" });
    await notifyCustomer(order, "order_cancelled", { refundPaise: order.totalPaise }, tx);
    return updated;
  });
  await refundOrder({ orderId: order.id, reason: "Cancelled by customer" });
  return order;
}

const fulfilmentMessages: Partial<Record<OrderStatus, { message: string; template?: Template }>> = {
  PACKED: { message: "Packed and ready to go." },
  SHIPPED: { message: "Shipped.", template: "order_shipped" },
  READY_FOR_PICKUP: { message: "Ready for pickup at the store. Show your pickup code at the counter.", template: "order_ready_for_pickup" },
  DELIVERED: { message: "Delivered.", template: "order_delivered" },
  COLLECTED: { message: "Collected from the store." },
};

// Packed → Shipped/Ready for pickup → Delivered/Collected (PRD §7.3).
export async function advanceFulfilment(input: {
  orderId: string;
  to: OrderStatus;
  actor: AdminActor;
  courier?: string;
  awb?: string;
  trackingUrl?: string;
  pickupOtp?: string;
}) {
  return db.$transaction(async (tx) => {
    const order = await lockOrder(tx, input.orderId);
    assertBranchAccess(input.actor, order.branchId);
    if (!["PACKED", "SHIPPED", "READY_FOR_PICKUP", "DELIVERED", "COLLECTED"].includes(input.to) || !canTransition(order.status, input.to, order.deliveryType)) {
      throw new DomainError("INVALID_STATE", `Can't move an order from ${order.status} to ${input.to}.`);
    }
    const data: Record<string, unknown> = { status: input.to };
    if (input.to === "SHIPPED") {
      if (!input.courier?.trim() || !input.awb?.trim()) throw new DomainError("TRACKING_REQUIRED", "Enter the courier and AWB number.");
      Object.assign(data, { courier: input.courier.trim(), awb: input.awb.trim(), trackingUrl: input.trackingUrl?.trim() || null });
    }
    if (input.to === "READY_FOR_PICKUP") {
      data.pickupOtp = String(randomInt(100000, 1000000));
    }
    if (input.to === "COLLECTED" && input.pickupOtp?.trim() !== order.pickupOtp) {
      throw new DomainError("BAD_OTP", "That pickup code doesn't match.");
    }

    const step = fulfilmentMessages[input.to]!;
    const updated = await tx.order.update({
      where: { id: order.id },
      data: { ...data, events: { create: { status: input.to, message: step.message, actorId: input.actor.id } } },
    });
    await audit(tx, input.actor, `order.${input.to.toLowerCase()}`, order.id, { status: order.status }, data);
    if (step.template) {
      await notifyCustomer(order, step.template, { courier: updated.courier, awb: updated.awb, trackingUrl: updated.trackingUrl, pickupOtp: updated.pickupOtp }, tx);
    }
    return updated;
  });
}
