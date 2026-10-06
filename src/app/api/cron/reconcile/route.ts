import { cronAuthorised } from "@/lib/http";
import { reconcilePayments } from "@/lib/orders/reconcile";

// Nightly (.github/workflows/cron.yml): make sure every payment Razorpay captured in the last 2 days is recorded.
export const maxDuration = 60;

async function handle(req: Request) {
  if (!cronAuthorised(req)) return Response.json({ error: "unauthorised" }, { status: 401 });
  return Response.json(await reconcilePayments());
}

export { handle as GET, handle as POST };
