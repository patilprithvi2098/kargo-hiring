"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Candidate } from "@/lib/db";
import { rankRole, type Ranked } from "@/lib/rank";
import { ROLE_TITLE, SHORTLIST_SIZE, STRONG_OPERATOR_MIN, type Role, type Rubric } from "@/lib/rubric";

type Props = {
  reviewer: string;
  candidates: Candidate[];
  rubrics: Record<Role, Rubric>;
  testRecipient: string | null;
  resendReady: boolean;
};

async function post(url: string, body?: unknown) {
  const res = await fetch(url, {
    method: "POST",
    headers: body instanceof FormData ? undefined : { "content-type": "application/json" },
    body: body instanceof FormData ? body : JSON.stringify(body ?? {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

const firstName = (n: string | null) => n?.split(" ")[0] || "there";

function gmailComposeUrl(to: string, subject: string, body: string) {
  const q = new URLSearchParams({ view: "cm", fs: "1", to, su: subject, body });
  return `https://mail.google.com/mail/?${q.toString()}`;
}

const strongOperator = (c: Candidate) =>
  !c.scores[c.role_applied]?.passes_floor &&
  (c.scores[c.role_applied]?.criteria.find((x) => x.key === "ops_native")?.score ?? 0) >= STRONG_OPERATOR_MIN;

function scoreBarClass(score: number) {
  if (score >= 50) return "score-bar-high";
  if (score >= 25) return "score-bar-mid";
  return "score-bar-low";
}

export default function Dashboard({ reviewer, candidates, rubrics, testRecipient, resendReady }: Props) {
  const router = useRouter();
  const [role, setRole] = useState<Role>("PM");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const ranked = useMemo(() => rankRole(candidates, role), [candidates, role]);
  const pending = candidates.filter((c) => c.role_applied === role && c.pipeline_status !== "ready");
  const selected = candidates.find((c) => c.id === selectedId) ?? null;
  const selectedRank = ranked.find((r) => r.id === selectedId) ?? null;

  const stats = (r: Role) => {
    const list = candidates.filter((c) => c.role_applied === r);
    return {
      total: list.length,
      ready: list.filter((c) => c.pipeline_status === "ready").length,
      sent: list.filter((c) => c.email_status === "sent").length,
    };
  };

  return (
    <div className="mx-auto w-full max-w-7xl flex-1 space-y-5 p-4 md:p-6 lg:p-8">
      {/* Header bar */}
      <header className="overflow-hidden rounded-2xl bg-gradient-to-r from-[var(--color-brand)] to-[var(--color-brand-light)] px-6 py-5 text-white shadow-lg">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/20 text-lg font-bold backdrop-blur-sm">K</div>
              <div>
                <h1 className="text-xl font-semibold tracking-tight">Kargo Hiring</h1>
                <p className="text-sm text-white/70">Product Manager & Senior Product Manager</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-white/70">
              Signed in as <b className="text-white">{reviewer}</b>
            </span>
            <button
              className="rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-sm backdrop-blur-sm hover:bg-white/20"
              onClick={async () => {
                await post("/api/logout");
                router.push("/login");
              }}
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      {/* Upload + role tabs row */}
      <div className="grid gap-5 lg:grid-cols-[1fr_auto]">
        <UploadPanel
          role={role}
          onRoleChange={(r) => {
            setRole(r);
            setSelectedId(null);
          }}
          onDone={() => router.refresh()}
        />
        <div className="flex gap-3 lg:flex-col lg:justify-end">
          {(["PM", "SPM"] as Role[]).map((r) => {
            const s = stats(r);
            const active = role === r;
            return (
              <button
                key={r}
                onClick={() => {
                  setRole(r);
                  setSelectedId(null);
                }}
                className={`group relative rounded-xl border px-5 py-3 text-left text-sm shadow-sm transition-all ${
                  active
                    ? "border-[var(--color-brand)] bg-[var(--color-brand)] text-white shadow-md"
                    : "border-slate-200 bg-white text-slate-800 hover:border-slate-300 hover:shadow-md"
                }`}
              >
                {active && (
                  <div className="absolute -left-0.5 top-1/2 hidden h-4 w-1 -translate-y-1/2 rounded-r-full bg-white lg:block" />
                )}
                <div className="font-semibold">{ROLE_TITLE[r]}</div>
                <div className={`mt-0.5 text-xs ${active ? "text-white/70" : "text-slate-500"}`}>
                  {s.ready}/{s.total} scored · {s.sent} emailed
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Candidate table */}
      <CandidateTable
        role={role}
        ranked={ranked}
        pending={pending}
        selectedId={selectedId}
        onSelect={setSelectedId}
        onRetry={async (id) => {
          await post(`/api/candidates/${id}/retry`).catch((e) => alert(e.message));
          router.refresh();
        }}
      />

      {/* Slide-over detail */}
      {selected && selected.pipeline_status === "ready" && (
        <SlideOver onClose={() => setSelectedId(null)}>
          <CandidateDetail
            key={selected.id + selected.email_type + selected.email_status}
            c={selected}
            rank={selectedRank}
            rubrics={rubrics}
            testRecipient={testRecipient}
            resendReady={resendReady}
            onChanged={() => router.refresh()}
          />
        </SlideOver>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- upload */

type UploadRow = { name: string; state: "queued" | "working" | "done" | "error"; note?: string };

function UploadPanel({
  role,
  onRoleChange,
  onDone,
}: {
  role: Role;
  onRoleChange: (r: Role) => void;
  onDone: () => void;
}) {
  const [fromFilename, setFromFilename] = useState(true);
  const [rows, setRows] = useState<UploadRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  async function run(files: File[]) {
    files = files.filter((f) => /\.(pdf|docx|txt)$/i.test(f.name));
    if (!files.length) return;
    setBusy(true);
    setRows(files.map((f) => ({ name: f.name, state: "queued" })));
    for (let i = 0; i < files.length; i++) {
      setRows((r) => r.map((x, j) => (j === i ? { ...x, state: "working" } : x)));
      const fd = new FormData();
      fd.append("file", files[i]);
      fd.append("role", fromFilename ? "AUTO_" + role : role);
      try {
        const res = await post("/api/upload", fd);
        setRows((r) =>
          r.map((x, j) =>
            j === i
              ? res.status === "ready"
                ? { ...x, state: "done", note: `${res.role} · ${res.score}` }
                : { ...x, state: "error", note: res.error || res.status }
              : x,
          ),
        );
      } catch (e) {
        setRows((r) => r.map((x, j) => (j === i ? { ...x, state: "error", note: (e as Error).message } : x)));
      }
      onDone();
    }
    setBusy(false);
    if (input.current) input.current.value = "";
  }

  const done = rows.filter((r) => r.state === "done" || r.state === "error").length;

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="grid gap-4 p-5 md:grid-cols-[16rem_minmax(0,1fr)]">
        <div className="space-y-2 text-sm">
          <label className="block">
            <span className="block text-xs font-medium uppercase tracking-wide text-slate-500">Applied role</span>
            <select
              value={role}
              onChange={(e) => onRoleChange(e.target.value as Role)}
              className="mt-1.5 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm focus:border-[var(--color-brand-accent)] focus:ring-1 focus:ring-[var(--color-brand-accent)] focus:outline-none"
              disabled={busy}
            >
              <option value="PM">Product Manager</option>
              <option value="SPM">Senior Product Manager</option>
            </select>
          </label>
          <label className="flex items-start gap-2 text-xs text-slate-500">
            <input
              type="checkbox"
              className="mt-0.5 rounded border-slate-300"
              checked={fromFilename}
              disabled={busy}
              onChange={(e) => setFromFilename(e.target.checked)}
            />
            <span>Use pm_ / spm_ in the filename when present</span>
          </label>
        </div>

        <div
          onDragOver={(e) => {
            e.preventDefault();
            if (!busy) setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            if (!busy) run(Array.from(e.dataTransfer.files));
          }}
          onClick={() => !busy && input.current?.click()}
          className={`flex min-h-28 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 py-6 text-center text-sm transition-all ${
            dragging
              ? "border-[var(--color-brand-accent)] bg-blue-50"
              : "border-slate-200 hover:border-[var(--color-brand-accent)] hover:bg-slate-50"
          } ${busy ? "cursor-wait opacity-70" : ""}`}
        >
          {!busy && (
            <svg className="mb-2 h-8 w-8 text-slate-400" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0 3 3m-3-3-3 3M6.75 19.5a4.5 4.5 0 0 1-1.41-8.775 5.25 5.25 0 0 1 10.233-2.33 3 3 0 0 1 3.758 3.848A3.752 3.752 0 0 1 18 19.5H6.75Z" />
            </svg>
          )}
          <span className="font-medium text-slate-700">
            {busy
              ? `Processing ${done}/${rows.length}…`
              : `Drop CVs here, or click to choose`}
          </span>
          <span className="mt-1 text-xs text-slate-400">
            {busy ? "Please wait while CVs are scored" : `PDF, DOCX or TXT · added as ${ROLE_TITLE[role]}`}
          </span>
          <input
            ref={input}
            type="file"
            multiple
            accept=".pdf,.docx,.txt"
            className="hidden"
            onChange={(e) => run(Array.from(e.target.files ?? []))}
          />
        </div>
      </div>
      {rows.length > 0 && (
        <div className="border-t border-slate-100 bg-slate-50/50 px-5 py-3">
          <ul className="max-h-40 space-y-1 overflow-y-auto font-mono text-xs">
            {rows.map((r, i) => (
              <li key={i} className="flex items-center gap-2">
                <span className="w-4 text-center">
                  {r.state === "done" ? (
                    <span className="text-emerald-600">✓</span>
                  ) : r.state === "error" ? (
                    <span className="text-red-500">✗</span>
                  ) : r.state === "working" ? (
                    <span className="animate-pulse text-blue-500">●</span>
                  ) : (
                    <span className="text-slate-300">·</span>
                  )}
                </span>
                <span className="truncate text-slate-600">{r.name}</span>
                {r.note && <span className={r.state === "error" ? "text-red-600" : "text-slate-400"}>{r.note}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

/* ---------------------------------------------------------------- table */

function Chip({ tone, children }: { tone: "green" | "slate" | "blue" | "red" | "amber"; children: React.ReactNode }) {
  const c = {
    green: "bg-emerald-50 text-emerald-700 ring-emerald-200/60",
    slate: "bg-slate-100 text-slate-600 ring-slate-200/60",
    blue: "bg-blue-50 text-blue-700 ring-blue-200/60",
    red: "bg-red-50 text-red-700 ring-red-200/60",
    amber: "bg-amber-50 text-amber-800 ring-amber-200/60",
  }[tone];
  return <span className={`inline-block whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-medium ring-1 ${c}`}>{children}</span>;
}

function StatusChip({ c }: { c: Candidate }) {
  if (c.email_status === "sent")
    return <Chip tone="blue">{c.email_type === "invite" ? "Invite sent" : "Decline sent"}</Chip>;
  if (c.email_status === "failed") return <Chip tone="red">Send failed</Chip>;
  if (c.decision) return <Chip tone="amber">You: {c.decision}</Chip>;
  return <Chip tone="slate">Awaiting you</Chip>;
}

function CandidateTable(props: {
  role: Role;
  ranked: Ranked[];
  pending: Candidate[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onRetry: (id: string) => Promise<void>;
}) {
  const other: Role = props.role === "PM" ? "SPM" : "PM";
  if (!props.ranked.length && !props.pending.length) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center shadow-sm">
        <svg className="mx-auto mb-3 h-12 w-12 text-slate-300" fill="none" stroke="currentColor" strokeWidth="1" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
        </svg>
        <p className="text-sm text-slate-500">No {ROLE_TITLE[props.role]} CVs yet. Upload some above.</p>
      </div>
    );
  }
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-100 bg-slate-50/80">
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">#</th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">Candidate</th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">{props.role} score</th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">{other}</th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">System</th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          {props.ranked
            .filter((c) => c.scores[props.role]?.passes_floor)
            .map((c) => (
              <Row key={c.id} c={c} other={other} {...props} />
            ))}
          {props.ranked.some((c) => !c.scores[props.role]?.passes_floor) && (
            <tr>
              <td colSpan={6} className="bg-slate-50 px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className="h-px flex-1 bg-red-200" />
                  <span className="whitespace-nowrap rounded-full bg-red-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-red-600 ring-1 ring-red-200/50">
                    Below {props.role} floor
                  </span>
                  <div className="h-px flex-1 bg-red-200" />
                </div>
                <p className="mt-1.5 text-center text-xs text-slate-500">
                  Doesn&apos;t show minimum{" "}
                  {props.role === "PM"
                    ? "product ownership (1+ yr with a shipped outcome)"
                    : "senior scope (4+ yrs, making calls with no senior PM above)"}
                  . Sorted by score, each gets a decline draft.
                </p>
              </td>
            </tr>
          )}
          {props.ranked
            .filter((c) => !c.scores[props.role]?.passes_floor)
            .map((c) => (
              <Row key={c.id} c={c} other={other} belowFloor {...props} />
            ))}
          {props.pending.map((c) => (
            <tr key={c.id} className="text-slate-400">
              <td className="px-4 py-3">–</td>
              <td className="px-4 py-3">
                <div className="font-medium text-slate-600">{c.name ?? c.cv_filename}</div>
                <div className="text-xs">{c.cv_filename}</div>
              </td>
              <td colSpan={3} className="px-4 py-3 text-xs">
                {c.pipeline_status === "error" ? (
                  <span className="text-red-600">{c.pipeline_error?.slice(0, 120)}</span>
                ) : (
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2 w-2 animate-pulse rounded-full bg-blue-400" />
                    Processing ({c.pipeline_status})…
                  </span>
                )}
              </td>
              <td className="px-4 py-3">
                <button className="text-xs font-medium text-[var(--color-brand-accent)] hover:underline" onClick={() => props.onRetry(c.id)}>
                  Retry
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Row({
  c,
  other,
  belowFloor = false,
  selectedId,
  onSelect,
}: {
  c: Ranked;
  belowFloor?: boolean;
  other: Role;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <>
      <tr
        onClick={() => onSelect(c.id)}
        className={`cursor-pointer transition-colors ${
          selectedId === c.id
            ? "bg-blue-50/60"
            : belowFloor
              ? "bg-slate-50/40 hover:bg-slate-50"
              : "hover:bg-slate-50/80"
        }`}
      >
        <td className="px-4 py-3 font-mono text-xs text-slate-400">{belowFloor ? "–" : c.rank}</td>
        <td className="px-4 py-3">
          <div className="font-medium text-slate-900">{c.name ?? "(name not found)"}</div>
          <div className="mt-0.5 max-w-[30rem] truncate text-xs text-slate-500">{(c.profile?.headline as string) ?? c.cv_filename}</div>
          {belowFloor && c.scores[c.role_applied]?.floor_reason && (
            <div className="mt-1 max-w-[36rem] truncate text-xs text-red-600" title={c.scores[c.role_applied]!.floor_reason!}>
              Floor: {c.scores[c.role_applied]!.floor_reason}
            </div>
          )}
          {(strongOperator(c) || c.duplicateOf.length > 0) && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {strongOperator(c) && <Chip tone="blue">strong operator — consider for ops / CS role</Chip>}
              {c.duplicateOf.length > 0 && <Chip tone="amber">same CV as {c.duplicateOf.join(", ")}</Chip>}
            </div>
          )}
        </td>
        <td className="px-4 py-3">
          <div className="flex items-center gap-2.5">
            <div className="h-2 w-20 overflow-hidden rounded-full bg-slate-100">
              <div className={`h-2 rounded-full ${scoreBarClass(c.total)}`} style={{ width: `${c.total}%` }} />
            </div>
            <span className="font-mono text-sm font-semibold text-slate-800">{c.total.toFixed(0)}</span>
          </div>
        </td>
        <td className="px-4 py-3 font-mono text-sm text-slate-500">
          <div className="flex flex-wrap items-center gap-1">
            {c.scores[other]?.total.toFixed(0) ?? "–"}
            {c.mismatch && <Chip tone="amber">fits {c.mismatch}?</Chip>}
          </div>
        </td>
        <td className="px-4 py-3">
          <Chip tone={c.recommendation === "invite" ? "green" : "slate"}>
            {c.recommendation === "invite" ? "Invite" : "Decline"}
          </Chip>
        </td>
        <td className="px-4 py-3">
          <StatusChip c={c} />
        </td>
      </tr>
      {c.rank === SHORTLIST_SIZE && (
        <tr>
          <td colSpan={6} className="px-4 py-0">
            <div className="flex items-center gap-3 py-2">
              <div className="h-px flex-1 border-t border-dashed border-emerald-300" />
              <span className="whitespace-nowrap rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-emerald-700 ring-1 ring-emerald-200/50">
                Shortlist line · top {SHORTLIST_SIZE}
              </span>
              <div className="h-px flex-1 border-t border-dashed border-emerald-300" />
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

/* ---------------------------------------------------------------- slide-over */

function SlideOver({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-20 flex justify-end bg-slate-900/50 backdrop-blur-sm" onClick={onClose} role="dialog" aria-modal="true">
      <div
        className="relative h-full w-full max-w-3xl overflow-y-auto bg-[var(--color-surface-alt)] p-4 shadow-2xl sm:p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          aria-label="Close"
          className="sticky top-0 z-10 float-right mb-3 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium shadow-sm hover:bg-slate-50"
        >
          ✕ Close
        </button>
        <div className="clear-both">{children}</div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- detail */

function CandidateDetail({
  c,
  rank,
  rubrics,
  testRecipient,
  resendReady,
  onChanged,
}: {
  c: Candidate;
  rank: Ranked | null;
  rubrics: Record<Role, Rubric>;
  testRecipient: string | null;
  resendReady: boolean;
  onChanged: () => void;
}) {
  const [subject, setSubject] = useState(c.email_subject ?? "");
  const [body, setBody] = useState(c.email_body ?? "");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [openedGmail, setOpenedGmail] = useState(false);

  const role = c.role_applied;
  const other: Role = role === "PM" ? "SPM" : "PM";
  const sent = c.email_status === "sent";
  const dirty = subject !== (c.email_subject ?? "") || body !== (c.email_body ?? "");
  const effective = c.decision ?? c.recommendation;
  const to = testRecipient || c.email;
  const p = (c.profile ?? {}) as Record<string, unknown>;

  async function act(label: string, fn: () => Promise<unknown>) {
    setBusy(label);
    setError(null);
    try {
      await fn();
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <article className="space-y-5">
      {/* Header card */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="bg-gradient-to-r from-[var(--color-brand)] to-[var(--color-brand-light)] px-5 py-4 text-white">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">{c.name ?? "(name not found)"}</h2>
              <p className="text-sm text-white/70">
                {ROLE_TITLE[role]} · {c.email ?? "no email found"} · {c.cv_filename}
              </p>
            </div>
            <div className="text-right">
              <div className="font-mono text-3xl font-bold">{c.scores[role]?.total.toFixed(0)}</div>
              <div className="text-xs text-white/70">
                {!c.scores[role]?.passes_floor ? `below ${role} floor` : rank ? `#${rank.rank} for ${role}` : ""} · {other}:{" "}
                {c.scores[other]?.total.toFixed(0) ?? "–"}
              </div>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3 px-5 py-3">
          {c.linkedin_url ? (
            <a
              href={c.linkedin_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M20.5 2h-17A1.5 1.5 0 002 3.5v17A1.5 1.5 0 003.5 22h17a1.5 1.5 0 001.5-1.5v-17A1.5 1.5 0 0020.5 2zM8 19H5v-9h3zM6.5 8.25A1.75 1.75 0 118.3 6.5a1.78 1.78 0 01-1.8 1.75zM19 19h-3v-4.74c0-1.42-.6-1.93-1.38-1.93A1.74 1.74 0 0013 14.19a.66.66 0 000 .14V19h-3v-9h2.9v1.3a3.11 3.11 0 012.7-1.4c1.55 0 3.36.86 3.36 3.66z"/></svg>
              View LinkedIn ↗
            </a>
          ) : (
            <span className="text-xs text-slate-400">No LinkedIn link on the CV</span>
          )}
        </div>
      </div>

      {/* Alerts */}
      {!c.scores[role]?.passes_floor && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <b>Below the {role} role floor:</b> {c.scores[role]?.floor_reason}
        </div>
      )}

      {strongOperator(c) && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          <b>Strong operator.</b> Not a fit for the {ROLE_TITLE[role]} floor, but scores {STRONG_OPERATOR_MIN}+ on
          operations — worth considering for an ops, CS or solutions role.
        </div>
      )}

      {/* Brief card */}
      {c.brief && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">What the CV demonstrates</h3>
          <p className="text-sm text-slate-800">{c.brief.summary}</p>
          <p className="mt-2 text-sm text-slate-600">
            <b className="text-slate-800">Why this score:</b> {c.brief.why_ranked}
          </p>
          {c.brief.watch_out && c.brief.watch_out !== "None" && (
            <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
              <b>Verify:</b> {c.brief.watch_out}
            </p>
          )}
        </div>
      )}

      {/* Scope strip */}
      <ScopeStrip p={p} />

      {/* Rubric scores card */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
          {role} rubric — evidence → score → confidence
        </h3>
        <ul className="divide-y divide-slate-100">
          {rubrics[role].criteria.map((cr) => {
            const s = c.scores[role]?.criteria.find((x) => x.key === cr.key);
            return (
              <li key={cr.key} className="py-3 first:pt-0 last:pb-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-slate-800">
                    {cr.name} <span className="text-xs font-normal text-slate-400">{cr.weight}%</span>
                  </span>
                  <span className="flex items-center gap-2">
                    {s?.confidence && (
                      <Chip tone={s.confidence === "high" ? "green" : s.confidence === "medium" ? "slate" : "amber"}>
                        {s.confidence}
                      </Chip>
                    )}
                    <span className="font-mono text-sm tracking-wider">
                      {Array.from({ length: 5 }, (_, i) => (
                        <span
                          key={i}
                          className={`inline-block h-2.5 w-2.5 rounded-full ${
                            i < (s?.score ?? 0) ? "bg-[var(--color-brand)]" : "bg-slate-200"
                          } ${i > 0 ? "ml-0.5" : ""}`}
                        />
                      ))}
                    </span>
                  </span>
                </div>
                <p className="mt-1 text-xs leading-relaxed text-slate-600">
                  {s?.evidence}{" "}
                  {s?.capped && <Chip tone="amber">{s.capped}</Chip>}{" "}
                  {s?.runs && s.runs.length > 1 && (
                    <Chip tone="slate">
                      borderline — scored {s.runs.length}× ({s.runs.join(" · ")}), median used
                    </Chip>
                  )}
                </p>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Evidence gaps */}
      {Array.isArray(p.evidence_gaps) && (p.evidence_gaps as string[]).length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
            Evidence gaps <span className="normal-case font-normal text-slate-400">— not demonstrated, not the same as can&apos;t</span>
          </h3>
          <ul className="ml-4 list-disc space-y-1 text-sm text-slate-700">
            {(p.evidence_gaps as string[]).map((g, i) => (
              <li key={i}>{g}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Interview probes */}
      {c.brief && c.brief.probes.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Verify in the interview</h3>
          <ol className="space-y-3">
            {c.brief.probes.map((q, i) =>
              typeof q === "string" ? (
                <li key={i} className="text-sm">{q}</li>
              ) : (
                <li key={i} className="rounded-xl border border-slate-100 bg-slate-50/50 p-4">
                  <p className="font-medium text-slate-800">
                    {i + 1}. {q.question}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">Tests: {q.tests}</p>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    <p className="rounded-lg bg-emerald-50 px-3 py-2 text-xs">
                      <span className="font-semibold text-emerald-700">Strong:</span> {q.strong_answer}
                    </p>
                    <p className="rounded-lg bg-red-50 px-3 py-2 text-xs">
                      <span className="font-semibold text-red-700">Red flag:</span> {q.red_flag}
                    </p>
                  </div>
                </li>
              ),
            )}
          </ol>
        </div>
      )}

      {/* Decision */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Your decision</h3>
        <p className="mb-3 text-sm">
          System recommends{" "}
          <Chip tone={c.recommendation === "invite" ? "green" : "slate"}>{c.recommendation}</Chip>
          {c.decision && (
            <span className="text-slate-500">
              {" "}
              · decided <b>{c.decision}</b> by {c.decided_by}
            </span>
          )}
        </p>
        <div className="flex gap-2">
          {(["invite", "decline"] as const).map((d) => (
            <button
              key={d}
              disabled={sent || !!busy}
              onClick={() => act("decision", () => post(`/api/candidates/${c.id}/decision`, { decision: d }))}
              className={`rounded-lg border px-4 py-2 text-sm font-medium capitalize transition-all disabled:opacity-40 ${
                effective === d
                  ? d === "invite"
                    ? "border-emerald-600 bg-emerald-600 text-white shadow-sm"
                    : "border-slate-800 bg-slate-800 text-white shadow-sm"
                  : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:shadow-sm"
              }`}
            >
              {busy === "decision" ? "…" : d}
            </button>
          ))}
        </div>
      </div>

      {/* Email draft */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Draft {c.email_type} email {c.email_edited && <span className="normal-case text-slate-400">(edited by you)</span>}
          </h3>
          {sent && (
            <span className="text-xs text-blue-700">
              Sent {c.send_channel === "gmail" ? "from Gmail" : "via Resend"} to {c.email_to} by {c.sent_by} ·{" "}
              {new Date(c.sent_at!).toLocaleString()}
            </span>
          )}
        </div>
        <input
          value={subject}
          disabled={sent}
          onChange={(e) => setSubject(e.target.value)}
          className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-[var(--color-brand-accent)] focus:ring-1 focus:ring-[var(--color-brand-accent)] focus:outline-none disabled:bg-slate-100 disabled:text-slate-500"
        />
        <textarea
          value={body}
          disabled={sent}
          onChange={(e) => setBody(e.target.value)}
          rows={9}
          className="mt-2 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm leading-relaxed focus:border-[var(--color-brand-accent)] focus:ring-1 focus:ring-[var(--color-brand-accent)] focus:outline-none disabled:bg-slate-100 disabled:text-slate-500"
        />
        <p className="mt-1.5 text-xs text-slate-400">
          [NAME] becomes &ldquo;{firstName(c.name)}&rdquo; when sent. The AI never saw the name.
        </p>
        {error && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
        {!sent && (
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              disabled={!dirty || !!busy}
              onClick={() => act("save", () => post(`/api/candidates/${c.id}/email`, { subject, body }))}
              className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
            >
              {busy === "save" ? "Saving…" : "Save edits"}
            </button>
            <a
              href={
                to && !dirty
                  ? gmailComposeUrl(
                      to,
                      subject.replace(/\[NAME\]/g, firstName(c.name)),
                      body.replace(/\[NAME\]/g, firstName(c.name)),
                    )
                  : undefined
              }
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => {
                if (dirty || !to) e.preventDefault();
                else setOpenedGmail(true);
              }}
              aria-disabled={dirty || !to}
              className={`inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-red-700 ${
                dirty || !to ? "pointer-events-none opacity-40" : ""
              }`}
              title={dirty ? "Save your edits first" : "Opens a pre-filled draft in your Gmail — you press Send there"}
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor"><path d="M20 18h-2V9.25L12 13 6 9.25V18H4V6h1.2l6.8 4.25L18.8 6H20m0-2H4c-1.11 0-2 .89-2 2v12a2 2 0 002 2h16a2 2 0 002-2V6a2 2 0 00-2-2z"/></svg>
              Open in Gmail
            </a>
            <button
              disabled={dirty || !!busy || !resendReady || !to}
              onClick={() => setConfirming(true)}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-700 disabled:opacity-40"
              title={dirty ? "Save your edits first" : !resendReady ? "Resend key not configured" : ""}
            >
              Confirm &amp; send via Resend
            </button>
          </div>
        )}
        {!sent && openedGmail && (
          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
            <span>Sent it from Gmail? Record it so the dashboard shows who sent what.</span>
            <button
              disabled={!!busy}
              onClick={() =>
                act("marked", () => post(`/api/candidates/${c.id}/mark-sent`, { confirmedType: c.email_type }))
              }
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-800 shadow-sm hover:bg-slate-50 disabled:opacity-40"
            >
              {busy === "marked" ? "Recording…" : "I sent it from Gmail"}
            </button>
            <button className="text-xs text-slate-500 underline" onClick={() => setOpenedGmail(false)}>
              Not sent
            </button>
          </div>
        )}
      </div>

      {/* Send confirmation modal */}
      {confirming && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm" onClick={() => setConfirming(false)}>
          <div className="w-full max-w-lg space-y-4 rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h4 className="text-lg font-semibold">
              Send this {c.email_type} to {c.name}?
            </h4>
            <p className="text-sm text-slate-600">
              To: <b>{to}</b>
              {testRecipient && <span className="text-amber-700"> (test mode)</span>}
            </p>
            <div className="max-h-64 overflow-y-auto whitespace-pre-wrap rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
              <b>{subject.replace(/\[NAME\]/g, firstName(c.name))}</b>
              {"\n\n"}
              {body.replace(/\[NAME\]/g, firstName(c.name))}
            </div>
            <p className="text-xs text-slate-500">
              This is recorded as your decision ({reviewerNote(c)}). It can&apos;t be unsent.
            </p>
            <div className="flex justify-end gap-2">
              <button className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium hover:bg-slate-50" onClick={() => setConfirming(false)}>
                Cancel
              </button>
              <button
                disabled={!!busy}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
                onClick={() =>
                  act("send", async () => {
                    await post(`/api/candidates/${c.id}/send`, { confirmedType: c.email_type });
                    setConfirming(false);
                  })
                }
              >
                {busy === "send" ? "Sending…" : "Send now"}
              </button>
            </div>
          </div>
        </div>
      )}
    </article>
  );
}

const KIND_STYLE: Record<string, string> = {
  ops: "bg-amber-100 text-amber-900",
  product: "bg-blue-100 text-blue-900",
  other: "bg-slate-100 text-slate-700",
};

type TimelineRow = { period: string; role: string; context: string; kind: string };

function ScopeStrip({ p }: { p: Record<string, unknown> }) {
  const scope = p.demonstrated_scope as { level: string; evidence: string; title_vs_scope: string } | undefined;
  const impact = p.impact_level as { level: string; evidence: string } | undefined;
  const timeline = (p.timeline as TimelineRow[] | undefined) ?? [];
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          { label: "Demonstrated scope", value: scope?.level, detail: scope?.title_vs_scope },
          { label: "Strongest evidence type", value: impact?.level, detail: impact?.evidence },
          {
            label: "Years (as stated)",
            value: `${String(p.operations_years ?? "–")} ops · ${String(p.product_years ?? "–")} product`,
            detail: `${String(p.total_years ?? "–")} total`,
          },
        ].map((item) => (
          <div key={item.label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="text-xs font-medium uppercase tracking-wider text-slate-400">{item.label}</div>
            <div className="mt-1 font-semibold text-slate-800">{item.value ?? "–"}</div>
            {item.detail && <div className="mt-0.5 line-clamp-2 text-xs text-slate-500">{item.detail}</div>}
          </div>
        ))}
      </div>
      {timeline.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h4 className="mb-2 text-xs font-medium uppercase tracking-wider text-slate-400">Career timeline</h4>
          <ol className="space-y-1 text-xs">
            {timeline.slice(0, 6).map((t, i) => (
              <li key={i} className="flex items-center gap-2">
                <span className="w-24 shrink-0 font-mono text-slate-400">{t.period}</span>
                <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-medium ${KIND_STYLE[t.kind] ?? KIND_STYLE.other}`}>{t.kind}</span>
                <span className="truncate text-slate-700">
                  {t.role} <span className="text-slate-400">· {t.context}</span>
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

function reviewerNote(c: Candidate) {
  return c.email_type === c.recommendation ? "agrees with the system" : "overrides the system";
}
