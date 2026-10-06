import { cronAuthorised } from "@/lib/http";
import { runScheduledJobs } from "@/lib/orders/jobs";

// Every 5 minutes (.github/workflows/cron.yml): release unpaid holds, escalate and auto-reject slow approvals,
// send waiting messages.
//   curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://<site>/api/cron/sweep
async function handle(req: Request) {
  if (!cronAuthorised(req)) return Response.json({ error: "unauthorised" }, { status: 401 });
  return Response.json(await runScheduledJobs());
}

export { handle as GET, handle as POST };
