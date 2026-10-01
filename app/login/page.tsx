"use client";
import { useActionState } from "react";
import { login } from "./actions";
import ThemeToggle from "@/components/ThemeToggle";

const PROFILES = [
  { name: "Arjun Mehta", role: "Founder", initials: "AM" },
  { name: "Prithvi Patil", role: "Reviewer", initials: "PP" },
  { name: "Mihirr Sosse", role: "Reviewer", initials: "MS" },
];

export default function LoginPage() {
  const [error, action, pending] = useActionState(login, null);
  return (
    <main className="flex flex-1 items-center justify-center p-4">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-sm space-y-5 rounded-2xl border border-[var(--border-card)] bg-[var(--bg-card)] p-7 shadow-[var(--shadow-lg)]">
        <div className="text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-[var(--color-brand)] to-[var(--color-brand-light)] text-lg font-bold text-white shadow-md">
            K
          </div>
          <h1 className="text-xl font-semibold text-[var(--text-primary)]">Kargo Hiring</h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Choose your profile to review candidates.
          </p>
        </div>
        <div className="space-y-2">
          {PROFILES.map((p) => (
            <form key={p.name} action={action}>
              <input type="hidden" name="name" value={p.name} />
              <button
                disabled={pending}
                className="flex w-full items-center gap-3 rounded-xl border border-[var(--border-card)] bg-[var(--bg-card-alt)] px-4 py-3 text-left transition-all hover:border-[var(--color-brand-accent)] hover:shadow-md disabled:opacity-50"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[var(--color-brand)] to-[var(--color-brand-light)] text-sm font-bold text-white">
                  {p.initials}
                </div>
                <div>
                  <div className="text-sm font-semibold text-[var(--text-primary)]">{p.name}</div>
                  <div className="text-xs text-[var(--text-muted)]">{p.role}</div>
                </div>
              </button>
            </form>
          ))}
        </div>
        {error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
        )}
      </div>
    </main>
  );
}
