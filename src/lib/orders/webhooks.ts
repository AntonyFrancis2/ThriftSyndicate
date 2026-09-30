import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import { getGateway } from "@/lib/payments";
import type { GatewayPayment } from "@/lib/payments/gateway";
import { recordPayment } from "./payment";

interface RazorpayPaymentEntity {
  id: string;
  order_id: string;
  amount: number;
  status: GatewayPayment["status"];
  method?: string;
  fee?: number;
  tax?: number;
}

interface RazorpayWebhook {
  event: string;
  payload: {
    payment?: { entity: RazorpayPaymentEntity };
    refund?: { entity: { id: string; status: string } };
  };
}

// Razorpay webhooks (PRD §8.2). The backup path: if the customer closes the browser before the
// callback, the order still reaches the approval queue. Duplicate deliveries are ignored.
export async function handleRazorpayWebhook(input: { rawBody: string; signature: string; eventId: string | null }) {
  if (!getGateway().verifyWebhookSignature(input.rawBody, input.signature)) {
    throw new DomainError("BAD_SIGNATURE", "Invalid webhook signature");
  }
  const body = JSON.parse(input.rawBody) as RazorpayWebhook;

  if (input.eventId) {
    try {
      await db.webhookEvent.create({ data: { id: input.eventId, event: body.event } });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        return { duplicate: true };
      }
      throw err;
    }
  }

  try {
    switch (body.event) {
      case "payment.authorized":
      case "payment.captured":
      case "payment.failed":
      case "order.paid": {
        const p = body.payload.payment?.entity;
        if (p) {
          await recordPayment({
            id: p.id,
            orderId: p.order_id,
            amountPaise: p.amount,
            status: p.status,
            method: p.method ?? null,
            feePaise: p.fee ?? null,
            taxPaise: p.tax ?? null,
          });
        }
        break;
      }
      case "refund.processed":
      case "refund.failed": {
        const r = body.payload.refund?.entity;
        if (r) {
          await db.refund.updateMany({
            where: { razorpayRefundId: r.id },
            data: { status: body.event === "refund.processed" ? "PROCESSED" : "FAILED" },
          });
        }
        break;
      }
    }
  } catch (err) {
    // Let Razorpay retry: forget the event so the retry is not treated as a duplicate.
    if (input.eventId) await db.webhookEvent.delete({ where: { id: input.eventId } }).catch(() => {});
    throw err;
  }
  return { duplicate: false };
}
