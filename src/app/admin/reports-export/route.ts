import { getAdmin } from "@/lib/auth/session";
import { reportRange, salesReport } from "@/lib/reports";

function csvCell(v: unknown) {
  const s = v == null ? "" : String(v);
  // Quote everything; neutralise spreadsheet formulas.
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return `"${safe.replaceAll('"', '""')}"`;
}

// Order-level CSV for the selected period (PRD §7.8).
export async function GET(req: Request) {
  const admin = await getAdmin();
  if (!admin) return new Response("Unauthorised", { status: 401 });
  const sp = Object.fromEntries(new URL(req.url).searchParams);
  const { days, from, to } = reportRange(sp);
  const r = await salesReport(admin, from, to, sp.branch ?? null);

  const header = ["order_number", "branch", "status", "paid_at", "decided_at", "items", "subtotal_inr", "shipping_inr", "gst_inr", "total_inr", "refunded_inr", "rejection_reason"];
  const rows = r.orders.map((o) => [
    o.number,
    o.branch.name,
    o.status,
    o.paidAt?.toISOString(),
    o.decidedAt?.toISOString(),
    o.items.map((i) => `${i.title} (${i.size})`).join("; "),
    o.subtotalPaise / 100,
    o.shippingPaise / 100,
    o.taxPaise / 100,
    o.totalPaise / 100,
    o.refundedPaise / 100,
    o.rejectionReason ?? "",
  ]);
  const csv = [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="thriftsyndicate-orders-${days}d.csv"`,
    },
  });
}
