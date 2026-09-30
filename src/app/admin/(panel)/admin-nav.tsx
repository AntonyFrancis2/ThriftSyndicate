"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function AdminNav({ items }: { items: { href: string; label: string }[] }) {
  const path = usePathname();
  return (
    <nav className="flex gap-1 overflow-x-auto px-4 pb-3 md:flex-col md:px-3 md:pb-0" aria-label="Admin">
      {items.map((i) => {
        const active = i.href === "/admin" ? path === "/admin" : path.startsWith(i.href);
        return (
          <Link key={i.href} href={i.href} aria-current={active ? "page" : undefined} className={`label shrink-0 px-3 py-2 ${active ? "bg-paper text-ink" : "text-ash hover:text-paper"}`}>
            {i.label}
          </Link>
        );
      })}
    </nav>
  );
}
