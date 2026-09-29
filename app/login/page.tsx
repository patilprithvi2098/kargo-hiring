"use client";
import { useActionState } from "react";
import { login } from "./actions";

export default function LoginPage() {
  const [error, action, pending] = useActionState(login, null);
  return (
    <main className="flex flex-1 items-center justify-center p-4">
      <form action={action} className="w-full max-w-sm space-y-5 rounded-2xl border border-slate-200 bg-white p-7 shadow-lg">
        <div className="text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-[var(--color-brand)] to-[var(--color-brand-light)] text-lg font-bold text-white shadow-md">
            K
          </div>
          <h1 className="text-xl font-semibold text-slate-900">Kargo Hiring</h1>
          <p className="mt-1 text-sm text-slate-500">
            Sign in to review candidates for the PM and SPM roles.
          </p>
        </div>
        <label className="block text-sm">
          <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Your name</span>
          <input
            name="name"
            required
            defaultValue="Arjun Mehta"
            placeholder="Arjun Mehta"
            className="mt-1.5 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 focus:border-[var(--color-brand-accent)] focus:ring-1 focus:ring-[var(--color-brand-accent)] focus:outline-none"
          />
          <span className="mt-1 block text-xs text-slate-400">Recorded against every decision and email you send.</span>
        </label>
        <label className="block text-sm">
          <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Password</span>
          <input
            name="password"
            type="password"
            required
            className="mt-1.5 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 focus:border-[var(--color-brand-accent)] focus:ring-1 focus:ring-[var(--color-brand-accent)] focus:outline-none"
          />
        </label>
        {error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
        )}
        <button
          disabled={pending}
          className="w-full rounded-lg bg-gradient-to-r from-[var(--color-brand)] to-[var(--color-brand-light)] px-4 py-2.5 text-sm font-semibold text-white shadow-md transition-all hover:shadow-lg disabled:opacity-50"
        >
          {pending ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </main>
  );
}
