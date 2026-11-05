"use client";

import { useActionState } from "react";
import { activateCounselor, type LoginState } from "@/lib/auth/actions";

export default function ActivationForm() {
  const [state, action, pending] = useActionState(activateCounselor, {} as LoginState);
  return (
    <form action={action} className="space-y-4">
      <label className="block" htmlFor="password">Set your password</label>
      <input id="password" name="password" type="password" required minLength={12}
        autoComplete="new-password" className="w-full rounded border p-2" />
      {state.error && <p role="alert">{state.error}</p>}
      <button disabled={pending} className="rounded bg-ink px-4 py-2 text-white">
        {pending ? "Activating…" : "Activate account"}
      </button>
    </form>
  );
}
