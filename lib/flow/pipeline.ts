import "server-only";
import {
  createCandidate,
  getCandidate,
  getRubrics,
  listCandidates,
  updateCandidate,
  upsertScore,
  type Candidate,
} from "../db";
import type { Role } from "../rubric";
import { readCvFile } from "./1-input";
import { extractProfile, separatePersonalDetails, type Profile } from "./2-context";
import { rankRole, recommendationFor, scoreBothRoles } from "./3-processing";
import { draftEmail, writeBrief } from "./4-ai";

// Runs the Components Map left to right for one uploaded CV:
// Trigger/Input -> Context -> Processing -> AI -> (Output: dashboard).
// Email sending is NOT part of the pipeline — it waits for the founder.

export async function processUpload(file: File, role: Role, opts: { sync?: boolean } = {}): Promise<string> {
  // TRIGGER + INPUT
  const input = await readCvFile(file, role);

  // CONTEXT (2a) — personal details split off before anything touches the AI
  const { personal, content } = separatePersonalDetails(input.rawText, input.filename);
  const id = await createCandidate({
    role_applied: role,
    cv_filename: input.filename,
    ...personal,
    cv_content: content,
  });

  try {
    await runAiSteps(id, opts);
  } catch (e) {
    await updateCandidate(id, { pipeline_status: "error", pipeline_error: String((e as Error).message ?? e) });
  }
  return id;
}

/** Context(2b) -> Processing -> AI. Re-runnable for a candidate that errored. */
export async function runAiSteps(id: string, opts: { sync?: boolean } = {}) {
  const c = await getCandidate(id);
  if (!c?.cv_content) throw new Error("Candidate has no CV content");
  const rubrics = await getRubrics();

  // CONTEXT (2b) — structured profile from redacted content
  const profile = await extractProfile(c.cv_content);
  await updateCandidate(id, { profile, pipeline_status: "extracted", pipeline_error: null });

  // PROCESSING — score against both rubrics
  const scores = await scoreBothRoles(profile, c.cv_content, rubrics);
  await upsertScore(id, "PM", scores.PM);
  await upsertScore(id, "SPM", scores.SPM);
  await updateCandidate(id, { pipeline_status: "scored" });

  // AI — brief for this candidate, then re-rank the role and (re)draft emails where needed
  const brief = await writeBrief({
    role: c.role_applied,
    profile,
    score: scores[c.role_applied],
    rubric: rubrics[c.role_applied],
  });
  await updateCandidate(id, { brief, pipeline_status: "ready" });

  // Bulk loads pass sync:false and re-rank once at the end, instead of after every CV.
  if (opts.sync !== false) await syncRecommendations(c.role_applied);
}

/**
 * After ranks move, keep each unsent candidate's recommendation and draft in line.
 * Human choices always win: an explicit decision or a hand-edited draft is never overwritten.
 */
export async function syncRecommendations(role: Role) {
  const ranked = rankRole(await listCandidates(), role);
  for (const r of ranked) {
    if (r.pipeline_status !== "ready" || r.email_status === "sent") continue;
    const recommendation = recommendationFor(r.rank, r.scores[role]?.passes_floor ?? true);
    const wanted = r.decision ?? recommendation;
    const patch: Partial<Candidate> = {};
    if (r.recommendation !== recommendation) patch.recommendation = recommendation;
    if (r.email_type !== wanted && !r.email_edited) {
      const draft = await draftEmail({ type: wanted, role, profile: r.profile as unknown as Profile });
      Object.assign(patch, {
        email_type: wanted,
        email_subject: draft.subject,
        email_body: draft.body,
        email_status: "draft",
      });
    }
    if (Object.keys(patch).length) await updateCandidate(r.id, patch);
  }
}

/** Founder overrides (or confirms) the recommendation. Regenerates the draft to match. */
export async function setDecision(id: string, decision: "invite" | "decline", reviewer: string) {
  const c = await getCandidate(id);
  if (!c) throw new Error("Candidate not found");
  if (c.email_status === "sent") throw new Error("Email already sent — decision is locked");
  const patch: Partial<Candidate> = {
    decision,
    decided_by: reviewer,
    decided_at: new Date().toISOString(),
  };
  if (c.email_type !== decision && c.profile) {
    const draft = await draftEmail({ type: decision, role: c.role_applied, profile: c.profile as unknown as Profile });
    Object.assign(patch, {
      email_type: decision,
      email_subject: draft.subject,
      email_body: draft.body,
      email_edited: false,
      email_status: "draft",
    });
  }
  await updateCandidate(id, patch);
}
