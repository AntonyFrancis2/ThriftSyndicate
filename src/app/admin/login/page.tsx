"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useActionState } from "react";
import { Logo } from "@/components/logo";
import { loginAction } from "../actions-auth";

function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, null);
  const next = useSearchParams().get("next") ?? "";
  return (
    <form action={action} className="w-full max-w-sm space-y-6">
      <Logo />
      <h1 className="display text-4xl">Staff login</h1>
      <input type="hidden" name="next" value={next} />
      <label className="block">
        <span className="field-label">Email</span>
        {/* React resets the form after each action; refill the email so a typo only costs the password. */}
        <input name="email" type="email" autoComplete="username" required className="field" defaultValue={state?.email} key={state?.email} />
      </label>
      <label className="block">
        <span className="field-label">Password</span>
        <input name="password" type="password" autoComplete="current-password" required className="field" />
      </label>
      {state?.error && <p className="text-sm text-signal" role="alert">{state.error}</p>}
      <button disabled={pending} className="btn btn-primary w-full">{pending ? "Signing in…" : "Sign in"}</button>
    </form>
  );
}

export default function AdminLoginPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-bone px-4 [--logo-bg:var(--color-bone)]">
      <Suspense>
        <LoginForm />
      </Suspense>
    </main>
  );
}
