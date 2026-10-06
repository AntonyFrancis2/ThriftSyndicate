import { after } from "next/server";
import { db } from "@/lib/db";
import type { Template } from "@/lib/notify";
import { NotConfigured, senderFor } from "./providers";

const MAX_ATTEMPTS = 5;
// A send that started this long ago and never finished (e.g. the function timed out) is tried again.
const STUCK_MS = 10 * 60_000;

// Sends recorded messages. Safe to run concurrently: each row is claimed before it is sent, so two runs
// never send the same message. Failures are retried on later runs (the cron sweep), up to MAX_ATTEMPTS.
export async function deliverPending({ limit = 25, now = new Date() } = {}) {
  const counts = { sent: 0, failed: 0, skipped: 0 };
  const candidates = await db.notification.findMany({
    where: {
      OR: [
        { status: "PENDING" },
        { status: "FAILED", attempts: { lt: MAX_ATTEMPTS } },
        { status: "SENDING", claimedAt: { lt: new Date(now.getTime() - STUCK_MS) }, attempts: { lt: MAX_ATTEMPTS } },
      ],
    },
    orderBy: { createdAt: "asc" },
    take: limit,
    select: { id: true, status: true, claimedAt: true },
  });

  for (const c of candidates) {
    const claim = await db.notification.updateMany({
      where: { id: c.id, status: c.status, claimedAt: c.claimedAt },
      data: { status: "SENDING", claimedAt: now, attempts: { increment: 1 } },
    });
    if (claim.count === 0) continue; // another run took it
    const n = await db.notification.findUniqueOrThrow({ where: { id: c.id } });
    try {
      const { providerId } = await senderFor(n.channel).send({
        channel: n.channel,
        to: n.to,
        template: n.template as Template,
        payload: n.payload as Record<string, unknown>,
      });
      await db.notification.update({ where: { id: n.id }, data: { status: "SENT", sentAt: new Date(), providerId, error: null } });
      counts.sent++;
    } catch (err) {
      const skipped = err instanceof NotConfigured;
      await db.notification.update({
        where: { id: n.id },
        data: { status: skipped ? "SKIPPED" : "FAILED", error: String(err instanceof Error ? err.message : err).slice(0, 500) },
      });
      if (skipped) counts.skipped++;
      else counts.failed++;
    }
  }
  return counts;
}

// Send right after the current request finishes (so the customer's email doesn't wait for the next sweep).
// Outside a request — tests, scripts — the cron sweep picks the messages up instead.
export function deliverSoon() {
  try {
    after(() => deliverPending().catch((err) => console.error("Notification delivery failed", err)));
  } catch {
    // No request scope.
  }
}
