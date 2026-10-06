import { db } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import { notify } from "@/lib/notify";
import { getGateway, type PaymentGateway } from "@/lib/payments";
import { recordPayment } from "./payment";

const DAY = 86_400_000;

interface Problem {
  problem: string;
  razorpayOrderId: string;
  razorpayPaymentId: string;
  paidPaise: number;
  expectedPaise: number | null;
}

// Nightly check that every payment Razorpay captured is recorded here. A captured payment we missed
// (browser closed and the webhook never arrived) is recorded now through the normal payment path, so the
// order reaches the approval queue. Anything that can't be fixed automatically is sent to the owners.
export async function reconcilePayments({ now = new Date(), days = 2, gateway = getGateway() }: { now?: Date; days?: number; gateway?: PaymentGateway } = {}) {
  const payments = await gateway.listPayments({ from: new Date(now.getTime() - days * DAY), to: now });
  const captured = payments.filter((p) => p.status === "captured" || p.status === "refunded");
  const problems: Problem[] = [];
  let recovered = 0;

  for (const p of captured) {
    const row = await db.payment.findUnique({ where: { razorpayPaymentId: p.id }, include: { checkout: true } });
    if (row?.status === "CAPTURED") {
      if (row.amountPaise !== p.amountPaise) {
        problems.push({ problem: "Recorded amount differs from Razorpay.", razorpayOrderId: p.orderId, razorpayPaymentId: p.id, paidPaise: p.amountPaise, expectedPaise: row.amountPaise });
      }
      continue;
    }
    try {
      await recordPayment(p);
      recovered++;
    } catch (err) {
      if (!(err instanceof DomainError)) throw err;
      problems.push({ problem: `Captured at Razorpay but not recorded here: ${err.message}`, razorpayOrderId: p.orderId, razorpayPaymentId: p.id, paidPaise: p.amountPaise, expectedPaise: null });
    }
  }

  if (problems.length > 0) {
    const admins = await db.adminUser.findMany({ where: { role: "SUPER_ADMIN", active: true } });
    for (const problem of problems) {
      for (const a of admins) {
        await notify({ channel: "admin", to: a.email, template: "admin_payment_mismatch", payload: { ...problem } });
      }
    }
  }
  return { checked: captured.length, recovered, problems: problems.length };
}
