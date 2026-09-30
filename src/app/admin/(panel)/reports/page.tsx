import Link from "next/link";
import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth/session";
import { categoryLabel } from "@/lib/catalog";
import { db } from "@/lib/db";
import { formatINR } from "@/lib/money";
import { reportRange, salesReport } from "@/lib/reports";
import { formatDuration } from "@/lib/time";
import { BranchSwitcher } from "../branch-switcher";

function Bars({ title, rows, format }: { title: string; rows: [string, number][]; format: (n: number) => string }) {
  const max = Math.max(1, ...rows.map((r) => r[1]));
  return (
    <section className="bg-paper p-5">
      <h2 className="field-label mb-3">{title}</h2>
      {rows.length === 0 ? (
        <p className="text-sm text-steel">No data yet.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map(([label, value]) => (
            <li key={label} className="grid grid-cols-[140px_1fr_auto] items-center gap-3 text-sm">
              <span className="truncate">{label}</span>
              <span className="h-2 bg-mist"><span className="block h-2 bg-ink" style={{ width: `${(value / max) * 100}%` }} /></span>
              <span className="label">{format(value)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default async function ReportsPage({ searchParams }: PageProps<"/admin/reports">) {
  const admin = await requireAdmin();
  const sp = await searchParams;
  const { days, from, to } = reportRange(sp);
  const branch = typeof sp.branch === "string" ? sp.branch : null;
  const r = await salesReport(admin, from, to, branch);
  const branches = admin.role === "SUPER_ADMIN" ? await db.branch.findMany({ orderBy: { name: "asc" } }) : [];
  const exportHref = `/admin/reports-export?days=${days}${branch ? `&branch=${branch}` : ""}`;

  const stats = [
    { label: "Revenue (approved, net)", value: formatINR(r.revenuePaise) },
    { label: "Approved orders", value: r.approvedCount },
    { label: "Median approval time", value: r.medianApprovalHours == null ? "—" : formatDuration(r.medianApprovalHours) },
    { label: "Rejection rate", value: r.paidCount ? `${Math.round((r.rejectedCount / r.paidCount) * 100)}%` : "—" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="display text-5xl">Reports</h1>
        <div className="flex flex-wrap items-end gap-3">
          {[7, 30, 90].map((d) => (
            <Link key={d} href={`/admin/reports?days=${d}${branch ? `&branch=${branch}` : ""}`} className={`label px-3 py-2 ${days === d ? "bg-ink text-paper" : "bg-paper"}`}>{d} days</Link>
          ))}
          {branches.length > 0 && <Suspense><BranchSwitcher branches={branches} /></Suspense>}
          <a href={exportHref} className="btn btn-secondary">Export CSV</a>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="bg-paper p-5">
            <p className="field-label">{s.label}</p>
            <p className="display mt-2 text-4xl">{s.value}</p>
          </div>
        ))}
      </div>

      <Bars title="Revenue by day" rows={r.byDay.map(([d, v]) => [d, v.revenuePaise])} format={formatINR} />
      <div className="grid gap-6 lg:grid-cols-2">
        <Bars title="By branch" rows={r.byBranch} format={formatINR} />
        <Bars title="By category" rows={r.byCategory.map(([k, v]) => [categoryLabel[k as keyof typeof categoryLabel] ?? k, v])} format={formatINR} />
        <Bars title="By era" rows={r.byEra.map(([k, v]) => [k === "RETRO" ? "Retro" : "Latest", v])} format={formatINR} />
        <Bars title="Rejection reasons" rows={r.rejectionReasons} format={(n) => `${n}`} />
        <Bars title="Top brands (pieces)" rows={r.topBrands} format={(n) => `${n}`} />
        <Bars title="Top teams (pieces)" rows={r.topTeams} format={(n) => `${n}`} />
      </div>
    </div>
  );
}
