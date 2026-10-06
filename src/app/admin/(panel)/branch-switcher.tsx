"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

// Super admins can look at one branch or all (PRD §7.1).
export function BranchSwitcher({ branches }: { branches: { id: string; name: string }[] }) {
  const router = useRouter();
  const path = usePathname();
  const params = useSearchParams();
  return (
    <label className="flex items-center gap-2">
      <span className="field-label">Branch</span>
      <select
        className="field w-auto py-1 text-sm"
        value={params.get("branch") ?? ""}
        onChange={(e) => {
          const next = new URLSearchParams(params);
          if (e.target.value) next.set("branch", e.target.value);
          else next.delete("branch");
          router.push(`${path}?${next}`);
        }}
      >
        <option value="">All branches</option>
        {branches.map((b) => (
          <option key={b.id} value={b.id}>{b.name}</option>
        ))}
      </select>
    </label>
  );
}
