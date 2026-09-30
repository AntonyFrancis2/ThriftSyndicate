"use client";

import { useRouter } from "next/navigation";
import type { ComponentProps } from "react";

// A GET form that updates the URL as soon as a filter changes (PRD §6.2: filters live in the URL).
export function AutoSubmitForm({ action, ...props }: ComponentProps<"form"> & { action: string }) {
  const router = useRouter();
  const go = (form: HTMLFormElement) => {
    const params = new URLSearchParams();
    for (const [k, v] of new FormData(form)) {
      if (typeof v === "string" && v !== "") params.append(k, v);
    }
    router.push(`${action}?${params}`, { scroll: false });
  };
  return (
    <form
      {...props}
      action={action}
      onChange={(e) => go(e.currentTarget)}
      onSubmit={(e) => {
        e.preventDefault();
        go(e.currentTarget);
      }}
    />
  );
}
