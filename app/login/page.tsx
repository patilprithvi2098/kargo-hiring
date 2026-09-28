"use client";
import { useActionState } from "react";
import { login } from "./actions";

export default function LoginPage() {
  const [error, action, pending] = useActionState(login, null);
  return (
    <main className="flex flex-1 items-center justify-center p-4">
      <form action={action} className="w-full max-w-sm space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div>
          <h1 className="text-lg font-semibold">Kargo Hiring</h1>
          <p className="text-sm text-slate-500">PM / SPM shortlist. The system recommends — you decide.</p>
        </div>
        <label className="block text-sm">
          <span className="text-slate-600">Your name</span>
          <input name="name" required placeholder="Arjun Mehta" className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" />
          <span className="mt-1 block text-xs text-slate-400">Recorded against every decision and email you send.</span>
        </label>
        <label className="block text-sm">
          <span className="text-slate-600">Password</span>
          <input name="password" type="password" required className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" />
        </label>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button disabled={pending} className="w-full rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">
          {pending ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </main>
  );
}
