"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { RejectionReason } from "@/generated/prisma/enums";
import { requireAdmin } from "@/lib/auth/session";
import { DomainError } from "@/lib/errors";
import { advanceFulfilment, approveOrder, rejectOrder, setFoundOnRack } from "@/lib/orders/decisions";

export type ActionResult = { ok: true; message?: string } | { ok: false; error: string } | null;

// A decision replaces the panel that made it, so its confirmation is shown as a banner on the order page.
async function run(orderId: string, fn: () => Promise<unknown>, notice?: "approved" | "rejected"): Promise<ActionResult> {
  try {
    await fn();
  } catch (err) {
    if (err instanceof DomainError) return { ok: false, error: err.message };
    throw err;
  }
  revalidatePath(`/admin/orders/${orderId}`);
  revalidatePath("/admin/orders");
  revalidatePath("/admin");
  if (notice) redirect(`/admin/orders/${orderId}?notice=${notice}`);
  return { ok: true };
}

export async function toggleFoundAction(orderId: string, orderItemId: string, found: boolean) {
  const admin = await requireAdmin();
  return run(orderId, () => setFoundOnRack({ orderItemId, found, actor: admin }));
}

export async function approveAction(orderId: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  return run(orderId, () => approveOrder({ orderId, actor: admin }), "approved");
}

const rejectSchema = z.object({
  reason: z.enum([RejectionReason.SOLD_IN_STORE, RejectionReason.DAMAGED, RejectionReason.CANNOT_LOCATE, RejectionReason.SUSPECTED_FRAUD, RejectionReason.OTHER]),
  note: z.string().max(500).optional(),
});

export async function rejectAction(orderId: string, _prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const parsed = rejectSchema.safeParse({ reason: formData.get("reason"), note: formData.get("note") || undefined });
  if (!parsed.success) return { ok: false, error: "Choose a reason." };
  return run(orderId, () => rejectOrder({ orderId, reason: parsed.data.reason, note: parsed.data.note, actor: admin }), "rejected");
}

const advanceSchema = z.object({
  to: z.enum(["PACKED", "SHIPPED", "READY_FOR_PICKUP", "DELIVERED", "COLLECTED"]),
  courier: z.string().max(80).optional(),
  awb: z.string().max(80).optional(),
  trackingUrl: z.union([z.url(), z.literal("")]).optional(),
  pickupOtp: z.string().max(10).optional(),
});

export async function advanceAction(orderId: string, _prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const parsed = advanceSchema.safeParse(Object.fromEntries([...formData.entries()].filter(([k]) => !k.startsWith("$"))));
  if (!parsed.success) return { ok: false, error: "Check the tracking details." };
  return run(orderId, () => advanceFulfilment({ orderId, ...parsed.data, actor: admin }));
}
