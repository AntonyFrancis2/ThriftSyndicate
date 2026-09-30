import { timingSafeEqual } from "node:crypto";
import { runScheduledJobs } from "@/lib/orders/jobs";

// Call every 5 minutes from the host's scheduler (Vercel Cron, GitHub Actions, crontab):
//   curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://<site>/api/cron/sweep
function authorised(req: Request) {
  const secret = process.env.CRON_SECRET;
  const given = req.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  if (!secret) return false;
  const a = Buffer.from(secret);
  const b = Buffer.from(given);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function handle(req: Request) {
  if (!authorised(req)) return Response.json({ error: "unauthorised" }, { status: 401 });
  return Response.json(await runScheduledJobs());
}

export { handle as GET, handle as POST };
