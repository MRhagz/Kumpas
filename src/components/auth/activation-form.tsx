"use client";

import { useActionState } from "react";
import { activateCounselor, type LoginState } from "@/lib/auth/actions";

export default function ActivationForm() {
  const [state, action, pending] = useActionState(activateCounselor, {} as LoginState);
  return (
    <form action={action} className="max-w-md space-y-5">
      <div>
        <label className="mb-1.5 block text-sm font-medium text-ink" htmlFor="password">Set your password</label>
        <input
          id="password"
          name="password"
          type="password"
          required
          minLength={12}
          autoComplete="new-password"
          aria-describedby="activation-password-hint"
          className="w-full rounded-lg border border-black/[0.08] bg-white/80 px-4 py-2.5 text-sm text-ink transition focus:border-forest/40 focus:outline-none focus:ring-2 focus:ring-forest/40"
        />
        <p id="activation-password-hint" className="mt-2 text-sm text-muted-text">Use at least 12 characters.</p>
      </div>
      {state.error && (
        <p role="alert" className="rounded-lg bg-[var(--red-light)] px-4 py-2.5 text-sm text-red-soft">{state.error}</p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="inline-flex min-h-11 w-full items-center justify-center rounded-2xl bg-forest px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-forest/90 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-forest disabled:opacity-60 sm:w-auto"
      >
        {pending ? "Activating…" : "Activate account"}
      </button>
    </form>
  );
}
