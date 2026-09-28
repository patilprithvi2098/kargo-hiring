"use client";

import { useMemo, useRef, useState } from "react";
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

/** Below the role floor but a strong operator — worth routing to ops / CS / solutions roles instead. */
const strongOperator = (c: Candidate) =>
  !c.scores[c.role_applied]?.passes_floor &&
  (c.scores[c.role_applied]?.criteria.find((x) => x.key === "ops_native")?.score ?? 0) >= STRONG_OPERATOR_MIN;

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
    <div className="mx-auto w-full max-w-7xl flex-1 space-y-4 p-4 md:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Kargo · Hiring dashboard</h1>
          <p className="text-sm text-slate-500">Product Manager & Senior Product Manager</p>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-slate-500">
            Signed in as <b className="text-slate-800">{reviewer}</b>
          </span>
          <button
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5"
            onClick={async () => {
              await post("/api/logout");
              router.push("/login");
            }}
          >
            Sign out
          </button>
        </div>
      </header>

      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        <b>The system ranks, explains and drafts. You decide.</b> No email is ever sent automatically — each
        one goes out only when you click <i>Confirm &amp; send</i> on that candidate.
        {testRecipient && (
          <span className="block pt-1 text-amber-800">
            Test mode: all emails are delivered to <b>{testRecipient}</b>.
          </span>
        )}
        {!resendReady && <span className="block pt-1 text-amber-800">Resend key not set yet — sending is disabled.</span>}
      </div>

      <UploadPanel onDone={() => router.refresh()} />

      <div className="flex gap-2">
        {(["PM", "SPM"] as Role[]).map((r) => {
          const s = stats(r);
          return (
            <button
              key={r}
              onClick={() => {
                setRole(r);
                setSelectedId(null);
              }}
              className={`rounded-lg border px-4 py-2 text-left text-sm ${
                role === r ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white"
              }`}
            >
              <div className="font-medium">{ROLE_TITLE[r]}</div>
              <div className={role === r ? "text-slate-300" : "text-slate-500"}>
                {s.ready}/{s.total} scored · {s.sent} emailed
              </div>
            </button>
          );
        })}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
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
        <div className="lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto">
          {selected && selected.pipeline_status === "ready" ? (
            <CandidateDetail
              key={selected.id + selected.email_type + selected.email_status}
              c={selected}
              rank={selectedRank}
              rubrics={rubrics}
              testRecipient={testRecipient}
              resendReady={resendReady}
              onChanged={() => router.refresh()}
            />
          ) : (
            <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
              Select a candidate to see the brief, score evidence and draft email.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- upload */

type UploadRow = { name: string; state: "queued" | "working" | "done" | "error"; note?: string };

function UploadPanel({ onDone }: { onDone: () => void }) {
  const [role, setRole] = useState<"AUTO" | Role>("AUTO");
  const [rows, setRows] = useState<UploadRow[]>([]);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  async function run(files: File[]) {
    setBusy(true);
    setRows(files.map((f) => ({ name: f.name, state: "queued" })));
    for (let i = 0; i < files.length; i++) {
      setRows((r) => r.map((x, j) => (j === i ? { ...x, state: "working" } : x)));
      const fd = new FormData();
      fd.append("file", files[i]);
      fd.append("role", role);
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
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <span className="block text-slate-600">Applied role</span>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as "AUTO" | Role)}
            className="mt-1 rounded-md border border-slate-300 bg-white px-2 py-1.5"
            disabled={busy}
          >
            <option value="AUTO">From filename (pm_ / spm_), else PM</option>
            <option value="PM">Product Manager</option>
            <option value="SPM">Senior Product Manager</option>
          </select>
        </label>
        <label className="text-sm">
          <span className="block text-slate-600">CVs (PDF, DOCX, TXT — multiple allowed)</span>
          <input
            ref={input}
            type="file"
            multiple
            accept=".pdf,.docx,.txt"
            disabled={busy}
            className="mt-1 block text-sm file:mr-3 file:rounded-md file:border-0 file:bg-slate-900 file:px-3 file:py-1.5 file:text-white"
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              if (files.length) run(files);
            }}
          />
        </label>
        {rows.length > 0 && (
          <span className="text-sm text-slate-500">
            {busy ? "Processing" : "Processed"} {done}/{rows.length}
          </span>
        )}
      </div>
      {rows.length > 0 && (
        <ul className="mt-3 max-h-40 space-y-0.5 overflow-y-auto font-mono text-xs">
          {rows.map((r, i) => (
            <li key={i} className="flex gap-2">
              <span className="w-4">
                {r.state === "done" ? "✓" : r.state === "error" ? "✗" : r.state === "working" ? "…" : "·"}
              </span>
              <span className="truncate">{r.name}</span>
              {r.note && <span className={r.state === "error" ? "text-red-600" : "text-slate-500"}>{r.note}</span>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* ---------------------------------------------------------------- table */

function Chip({ tone, children }: { tone: "green" | "slate" | "blue" | "red" | "amber"; children: React.ReactNode }) {
  const c = {
    green: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    slate: "bg-slate-100 text-slate-600 ring-slate-200",
    blue: "bg-blue-50 text-blue-700 ring-blue-200",
    red: "bg-red-50 text-red-700 ring-red-200",
    amber: "bg-amber-50 text-amber-800 ring-amber-200",
  }[tone];
  return <span className={`inline-block whitespace-nowrap rounded px-1.5 py-0.5 text-xs ring-1 ${c}`}>{children}</span>;
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
      <div className="rounded-lg border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
        No {ROLE_TITLE[props.role]} CVs yet. Upload some above.
      </div>
    );
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="w-full text-sm">
        <thead className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-3 py-2">#</th>
            <th className="px-3 py-2">Candidate</th>
            <th className="px-3 py-2">{props.role} score</th>
            <th className="px-3 py-2">{other}</th>
            <th className="px-3 py-2">System</th>
            <th className="px-3 py-2">Status</th>
          </tr>
        </thead>
        <tbody>
          {props.ranked.map((c) => (
            <Row key={c.id} c={c} other={other} {...props} />
          ))}
          {props.pending.map((c) => (
            <tr key={c.id} className="border-t border-slate-100 text-slate-500">
              <td className="px-3 py-2">–</td>
              <td className="px-3 py-2">
                <div className="font-medium text-slate-700">{c.name ?? c.cv_filename}</div>
                <div className="text-xs">{c.cv_filename}</div>
              </td>
              <td colSpan={3} className="px-3 py-2 text-xs">
                {c.pipeline_status === "error" ? (
                  <span className="text-red-600">{c.pipeline_error?.slice(0, 120)}</span>
                ) : (
                  `Processing (${c.pipeline_status})…`
                )}
              </td>
              <td className="px-3 py-2">
                <button className="text-xs underline" onClick={() => props.onRetry(c.id)}>
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
  selectedId,
  onSelect,
}: {
  c: Ranked;
  other: Role;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <>
      <tr
        onClick={() => onSelect(c.id)}
        className={`cursor-pointer border-t border-slate-100 hover:bg-slate-50 ${selectedId === c.id ? "bg-slate-100" : ""}`}
      >
        <td className="px-3 py-2 font-mono text-slate-500">{c.rank}</td>
        <td className="px-3 py-2">
          <div className="font-medium">{c.name ?? "(name not found)"}</div>
          <div className="max-w-[16rem] truncate text-xs text-slate-500">{(c.profile?.headline as string) ?? c.cv_filename}</div>
          {!c.scores[c.role_applied]?.passes_floor && (
            <Chip tone="red">below {c.role_applied} floor</Chip>
          )}{" "}
          {strongOperator(c) && <Chip tone="blue">strong operator — other role?</Chip>}
        </td>
        <td className="px-3 py-2">
          <div className="flex items-center gap-2">
            <div className="h-1.5 w-16 rounded bg-slate-100">
              <div className="h-1.5 rounded bg-slate-800" style={{ width: `${c.total}%` }} />
            </div>
            <span className="font-mono">{c.total.toFixed(0)}</span>
          </div>
        </td>
        <td className="px-3 py-2 font-mono text-slate-500">
          {c.scores[other]?.total.toFixed(0) ?? "–"}
          {c.mismatch && (
            <span className="ml-1">
              <Chip tone="amber">fits {c.mismatch}?</Chip>
            </span>
          )}
        </td>
        <td className="px-3 py-2">
          <Chip tone={c.recommendation === "invite" ? "green" : "slate"}>
            {c.recommendation === "invite" ? "Invite" : "Decline"}
          </Chip>
        </td>
        <td className="px-3 py-2">
          <StatusChip c={c} />
        </td>
      </tr>
      {c.rank === SHORTLIST_SIZE && (
        <tr>
          <td colSpan={6} className="border-t-2 border-dashed border-emerald-400 px-3 py-1 text-center text-xs text-emerald-700">
            Shortlist line — the top {SHORTLIST_SIZE} above the role floor get invite drafts; everyone else gets a decline draft. Skim below the line once.
          </td>
        </tr>
      )}
    </>
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
    <article className="space-y-4 rounded-lg border border-slate-200 bg-white p-4">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">{c.name ?? "(name not found)"}</h2>
          <p className="text-sm text-slate-500">
            Applied: {ROLE_TITLE[role]} · {c.email ?? "no email found"} · {c.cv_filename}
          </p>
          {c.linkedin_url ? (
            <a
              href={c.linkedin_url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 inline-block rounded-md border border-slate-300 px-2 py-0.5 text-xs text-slate-700 hover:bg-slate-50"
              title="Opens LinkedIn in a new tab. Nothing is fetched or scored from it — your judgment only."
            >
              View LinkedIn ↗
            </a>
          ) : (
            <span className="mt-1 inline-block text-xs text-slate-400">No LinkedIn link on the CV</span>
          )}
        </div>
        <div className="text-right">
          <div className="font-mono text-2xl">{c.scores[role]?.total.toFixed(0)}</div>
          <div className="text-xs text-slate-500">
            {rank ? `#${rank.rank} for ${role}` : ""} · {other}: {c.scores[other]?.total.toFixed(0) ?? "–"}
          </div>
        </div>
      </header>

      {!c.scores[role]?.passes_floor && (
        <p className="rounded-md bg-red-50 p-2 text-sm text-red-800">
          <b>Below the {role} role floor:</b> {c.scores[role]?.floor_reason}
        </p>
      )}

      {strongOperator(c) && (
        <p className="rounded-md bg-blue-50 p-2 text-sm text-blue-800">
          <b>Strong operator.</b> Not a fit for the {ROLE_TITLE[role]} floor, but scores {STRONG_OPERATOR_MIN}+ on
          operations — Kargo&apos;s best hires look like this. Consider for an ops, CS or solutions role before declining.
        </p>
      )}

      {/* 30-second scan: what's demonstrated, at what scope, what's missing, what to ask */}
      {c.brief && (
        <section className="space-y-1 rounded-md bg-slate-50 p-3 text-sm">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">What the CV demonstrates</h3>
          <p>{c.brief.summary}</p>
          <p className="text-slate-600">
            <b>Why this score:</b> {c.brief.why_ranked}
          </p>
          {c.brief.watch_out && c.brief.watch_out !== "None" && (
            <p className="text-amber-800">
              <b>Verify:</b> {c.brief.watch_out}
            </p>
          )}
        </section>
      )}

      <ScopeStrip p={p} />

      <section>
        <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
          {role} rubric — evidence → score → confidence
        </h3>
        <ul className="divide-y divide-slate-100 text-sm">
          {rubrics[role].criteria.map((cr) => {
            const s = c.scores[role]?.criteria.find((x) => x.key === cr.key);
            return (
              <li key={cr.key} className="py-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">
                    {cr.name} <span className="text-xs font-normal text-slate-400">{cr.weight}%</span>
                  </span>
                  <span className="flex items-center gap-2">
                    {s?.confidence && (
                      <Chip tone={s.confidence === "high" ? "green" : s.confidence === "medium" ? "slate" : "amber"}>
                        {s.confidence} confidence
                      </Chip>
                    )}
                    <span className="font-mono text-xs tracking-widest">
                      {"●".repeat(s?.score ?? 0)}
                      <span className="text-slate-300">{"●".repeat(5 - (s?.score ?? 0))}</span>
                    </span>
                  </span>
                </div>
                <p className="text-xs text-slate-600">
                  {s?.evidence}{" "}
                  {s?.capped && <Chip tone="amber">{s.capped}</Chip>}
                </p>
              </li>
            );
          })}
        </ul>
      </section>

      {Array.isArray(p.evidence_gaps) && (p.evidence_gaps as string[]).length > 0 && (
        <section className="text-sm">
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Evidence gaps <span className="normal-case font-normal">— not demonstrated on the CV, not the same as can&apos;t</span>
          </h3>
          <ul className="ml-4 list-disc space-y-0.5 text-slate-700">
            {(p.evidence_gaps as string[]).map((g, i) => (
              <li key={i}>{g}</li>
            ))}
          </ul>
        </section>
      )}

      {c.brief && c.brief.probes.length > 0 && (
        <section className="text-sm">
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Verify in the interview</h3>
          <ol className="space-y-2">
            {c.brief.probes.map((q, i) =>
              typeof q === "string" ? (
                <li key={i}>{q}</li>
              ) : (
                <li key={i} className="rounded-md border border-slate-200 p-2">
                  <p className="font-medium">
                    {i + 1}. {q.question}
                  </p>
                  <p className="text-xs text-slate-500">Tests: {q.tests}</p>
                  <p className="mt-1 text-xs">
                    <span className="text-emerald-700">Strong answer:</span> {q.strong_answer}
                  </p>
                  <p className="text-xs">
                    <span className="text-red-700">Red flag:</span> {q.red_flag}
                  </p>
                </li>
              ),
            )}
          </ol>
        </section>
      )}

      <section className="space-y-2 border-t border-slate-200 pt-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Your decision</h3>
        <p className="text-sm">
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
              className={`rounded-md border px-3 py-1.5 text-sm capitalize disabled:opacity-40 ${
                effective === d ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white"
              }`}
            >
              {busy === "decision" ? "…" : d}
            </button>
          ))}
        </div>
      </section>

      <section className="space-y-2 border-t border-slate-200 pt-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Draft {c.email_type} email {c.email_edited && <span className="normal-case">(edited by you)</span>}
          </h3>
          {sent && (
            <span className="text-xs text-blue-700">
              Sent to {c.email_to} by {c.sent_by} · {new Date(c.sent_at!).toLocaleString()}
            </span>
          )}
        </div>
        <input
          value={subject}
          disabled={sent}
          onChange={(e) => setSubject(e.target.value)}
          className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm disabled:bg-slate-50"
        />
        <textarea
          value={body}
          disabled={sent}
          onChange={(e) => setBody(e.target.value)}
          rows={9}
          className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm leading-relaxed disabled:bg-slate-50"
        />
        <p className="text-xs text-slate-400">
          [NAME] becomes “{firstName(c.name)}” when sent. The AI never saw the name.
        </p>
        {error && <p className="text-sm text-red-600">{error}</p>}
        {!sent && (
          <div className="flex flex-wrap gap-2">
            <button
              disabled={!dirty || !!busy}
              onClick={() => act("save", () => post(`/api/candidates/${c.id}/email`, { subject, body }))}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm disabled:opacity-40"
            >
              {busy === "save" ? "Saving…" : "Save edits"}
            </button>
            <button
              disabled={dirty || !!busy || !resendReady || !to}
              onClick={() => setConfirming(true)}
              className="rounded-md bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40"
              title={dirty ? "Save your edits first" : !resendReady ? "Resend key not configured" : ""}
            >
              Confirm &amp; send {c.email_type}
            </button>
          </div>
        )}
      </section>

      {confirming && (
        <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/40 p-4" onClick={() => setConfirming(false)}>
          <div className="w-full max-w-lg space-y-3 rounded-lg bg-white p-4 text-sm" onClick={(e) => e.stopPropagation()}>
            <h4 className="font-semibold">
              Send this {c.email_type} to {c.name}?
            </h4>
            <p className="text-slate-600">
              To: <b>{to}</b>
              {testRecipient && <span className="text-amber-700"> (test mode)</span>}
            </p>
            <div className="max-h-64 overflow-y-auto whitespace-pre-wrap rounded border border-slate-200 bg-slate-50 p-2">
              <b>{subject.replace(/\[NAME\]/g, firstName(c.name))}</b>
              {"\n\n"}
              {body.replace(/\[NAME\]/g, firstName(c.name))}
            </div>
            <p className="text-xs text-slate-500">
              This is recorded as your decision ({reviewerNote(c)}). It can’t be unsent.
            </p>
            <div className="flex justify-end gap-2">
              <button className="rounded-md border border-slate-300 px-3 py-1.5" onClick={() => setConfirming(false)}>
                Cancel
              </button>
              <button
                disabled={!!busy}
                className="rounded-md bg-emerald-700 px-3 py-1.5 font-medium text-white disabled:opacity-50"
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
    <section className="space-y-2 text-sm">
      <div className="grid gap-2 sm:grid-cols-3">
        <div className="rounded-md border border-slate-200 p-2">
          <div className="text-xs text-slate-500">Demonstrated scope</div>
          <div className="font-medium">{scope?.level ?? "–"}</div>
          {scope?.title_vs_scope && <div className="text-xs text-slate-500">{scope.title_vs_scope}</div>}
        </div>
        <div className="rounded-md border border-slate-200 p-2">
          <div className="text-xs text-slate-500">Strongest evidence type</div>
          <div className="font-medium">{impact?.level ?? "–"}</div>
          {impact?.evidence && <div className="line-clamp-2 text-xs text-slate-500">{impact.evidence}</div>}
        </div>
        <div className="rounded-md border border-slate-200 p-2">
          <div className="text-xs text-slate-500">Years (as stated)</div>
          <div className="font-medium">
            {String(p.operations_years ?? "–")} ops · {String(p.product_years ?? "–")} product
          </div>
          <div className="text-xs text-slate-500">{String(p.total_years ?? "–")} total</div>
        </div>
      </div>
      {timeline.length > 0 && (
        <ol className="space-y-0.5 text-xs">
          {timeline.slice(0, 6).map((t, i) => (
            <li key={i} className="flex gap-2">
              <span className="w-24 shrink-0 font-mono text-slate-500">{t.period}</span>
              <span className={`shrink-0 rounded px-1 ${KIND_STYLE[t.kind] ?? KIND_STYLE.other}`}>{t.kind}</span>
              <span className="truncate">
                {t.role} <span className="text-slate-500">· {t.context}</span>
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function reviewerNote(c: Candidate) {
  return c.email_type === c.recommendation ? "agrees with the system" : "overrides the system";
}
