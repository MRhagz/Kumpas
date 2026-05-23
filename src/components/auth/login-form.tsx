"use client";

import { useActionState } from "react";
import { ArrowRight } from "lucide-react";
import { signIn, type LoginState } from "@/lib/auth/actions";

const initialState: LoginState = {};

export default function LoginForm() {
  const [state, formAction, pending] = useActionState(signIn, initialState);

  return (
    <form action={formAction} className="space-y-5">
      <div>
        <label
          htmlFor="email"
          className="block text-sm font-medium text-ink mb-1.5"
        >
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="you@school.edu"
          className="w-full rounded-lg border border-black/[0.08] bg-white/80 px-4 py-2.5 text-sm text-ink placeholder:text-muted-text focus:outline-none focus:ring-2 focus:ring-forest/40 focus:border-forest/40 transition"
        />
      </div>

      <div>
        <label
          htmlFor="password"
          className="block text-sm font-medium text-ink mb-1.5"
        >
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          className="w-full rounded-lg border border-black/[0.08] bg-white/80 px-4 py-2.5 text-sm text-ink placeholder:text-muted-text focus:outline-none focus:ring-2 focus:ring-forest/40 focus:border-forest/40 transition"
        />
      </div>

      {state.error && (
        <div className="rounded-lg bg-[var(--red-light)] px-4 py-2.5 text-sm text-red-soft">
          {state.error}
        </div>
      )}

      <button
        type="submit"
        disabled={pending}
        className="group inline-flex w-full items-center justify-center gap-2 rounded-full bg-ink px-6 py-3 text-sm font-semibold text-cream shadow-btn transition-all duration-300 hover:scale-[1.02] hover:shadow-lg active:scale-[0.98] disabled:opacity-60 disabled:hover:scale-100 cursor-pointer"
      >
        {pending ? "Signing in…" : "Sign in"}
        {!pending && (
          <ArrowRight
            size={16}
            className="transition-transform duration-300 group-hover:translate-x-1"
          />
        )}
      </button>
    </form>
  );
}
