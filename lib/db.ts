import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "./env";
import type { Criterion, Role, Rubric } from "./rubric";

export type Probe = { question: string; tests: string; strong_answer: string; red_flag: string };
export type Brief = { summary: string; why_ranked: string; probes: Probe[]; watch_out: string };

// All tables are RLS-locked. Every read/write goes through kh_* SECURITY DEFINER
// functions that require KH_DB_SECRET, which lives only on the server.

export type CriterionScore = {
  key: string;
  score: number;
  evidence: string;
  verified?: boolean;
  capped?: string;
  confidence?: "high" | "medium" | "low";
};
export type RoleScore = {
  total: number;
  criteria: CriterionScore[];
  passes_floor: boolean;
  floor_reason: string | null;
};

export type Candidate = {
  id: string;
  created_at: string;
  role_applied: Role;
  cv_filename: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  linkedin_url: string | null;
  cv_content?: string;
  profile: Record<string, unknown> | null;
  pipeline_status: "uploaded" | "extracted" | "scored" | "ready" | "error";
  pipeline_error: string | null;
  brief: Brief | null;
  recommendation: "invite" | "decline" | null;
  decision: "invite" | "decline" | null;
  decided_by: string | null;
  decided_at: string | null;
  email_type: "invite" | "decline" | null;
  email_subject: string | null;
  email_body: string | null;
  email_edited: boolean;
  email_status: "none" | "draft" | "sent" | "failed";
  email_to: string | null;
  email_error: string | null;
  sent_at: string | null;
  sent_by: string | null;
  resend_id: string | null;
  send_channel: "resend" | "gmail" | null;
  scores: Partial<Record<Role, RoleScore>>;
};

let client: SupabaseClient | null = null;
function sb() {
  client ??= createClient(env.supabaseUrl(), env.supabaseKey(), {
    auth: { persistSession: false },
  });
  return client;
}

async function rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await sb().rpc(fn, { p_secret: env.dbSecret(), ...args });
  if (error) throw new Error(`${fn}: ${error.message}`);
  return data as T;
}

export async function getRubrics(): Promise<Record<Role, Rubric>> {
  const rows = await rpc<{ role: Role; criteria: Criterion[] }[]>("kh_rubric_get");
  const out = {} as Record<Role, Rubric>;
  for (const r of rows) out[r.role] = { role: r.role, criteria: r.criteria };
  if (!out.PM || !out.SPM) throw new Error("Rubric missing in database — run scripts/seed-rubric.mjs");
  return out;
}

export const createCandidate = (p: {
  role_applied: Role;
  cv_filename: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  linkedin_url: string | null;
  cv_content: string;
}) => rpc<string>("kh_candidate_create", { p });

export const updateCandidate = (id: string, p: Partial<Candidate>) =>
  rpc<void>("kh_candidate_update", { p_id: id, p });

export const upsertScore = (candidateId: string, role: Role, s: RoleScore) =>
  rpc<void>("kh_score_upsert", {
    p_candidate: candidateId,
    p_role: role,
    p_total: s.total,
    p_criteria: s.criteria,
    p_passes_floor: s.passes_floor,
    p_floor_reason: s.floor_reason,
  });

export const listCandidates = () => rpc<Candidate[]>("kh_candidates_list");

export const getCandidate = (id: string) => rpc<Candidate | null>("kh_candidate_get", { p_id: id });
