import "server-only";
import {
  createCandidate,
  getCandidate,
  getRubrics,
  listCandidates,
  type RoleScore,
  updateCandidate,
  upsertScore,
  type Candidate,
} from "../db";
import { BORDERLINE_BAND, MIN_INVITE_SCORE, applyCaps, weightedTotal, type Role } from "../rubric";
import { readCvFile } from "./1-input";
import { assertNoPersonalDetails, extractProfile, separatePersonalDetails, type Profile } from "./2-context";
import { rankRole, recommendationFor, scoreBothRoles } from "./3-processing";
import { shortlistLine } from "../rank";
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

  // Fail closed: never send content to the AI if anything personal survived redaction.
  assertNoPersonalDetails(c.cv_content);

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
  await stabilizeBorderline(role);
  const ranked = rankRole(await listCandidates(), role);
  for (const r of ranked) {
    if (r.pipeline_status !== "ready" || r.email_status === "sent") continue;
    const recommendation = recommendationFor(r.rank, r.scores[role]?.passes_floor ?? true, r.total);
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

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

/**
 * The model's 1–5 judgements vary between runs (the same CV submitted twice scored 20 and 40).
 * Anyone whose score could move them across the shortlist line or the invite minimum is scored
 * two more times; each criterion uses the median of 3 runs. Duplicate CVs share one result.
 */
export async function stabilizeBorderline(role: Role) {
  const rubrics = await getRubrics();
  const done = new Set<string>();
  for (let pass = 0; pass < 3; pass++) {
    const ranked = rankRole(await listCandidates(), role);
    const line = shortlistLine(ranked);
    const near = (t: number) =>
      Math.abs(t - MIN_INVITE_SCORE) <= BORDERLINE_BAND || (line !== null && Math.abs(t - line) <= BORDERLINE_BAND);
    const todo = ranked.filter(
      (r) =>
        r.pipeline_status === "ready" &&
        r.email_status !== "sent" &&
        !done.has(r.content_hash ?? r.id) &&
        !r.scores[role]?.criteria[0]?.runs &&
        (near(r.total) || r.duplicateOf.length > 0),
    );
    if (!todo.length) return;
    for (const r of todo) {
      done.add(r.content_hash ?? r.id);
      const c = await getCandidate(r.id);
      if (!c?.cv_content || !c.profile) continue;
      const extra = [
        await scoreBothRoles(c.profile as unknown as Profile, c.cv_content, rubrics),
        await scoreBothRoles(c.profile as unknown as Profile, c.cv_content, rubrics),
      ];
      const twins = ranked.filter((x) => x.content_hash && x.content_hash === r.content_hash).map((x) => x.id);
      for (const scoreRole of ["PM", "SPM"] as Role[]) {
        const all = [c.scores[scoreRole], ...extra.map((e) => e[scoreRole])].filter(Boolean) as RoleScore[];
        const criteria = rubrics[scoreRole].criteria.map((cr) => {
          const runs = all.map((a) => a.criteria.find((x) => x.key === cr.key)?.score ?? 1);
          const m = median(runs);
          // keep the evidence from a run that actually gave the median score
          const src = all.find((a) => a.criteria.find((x) => x.key === cr.key)?.score === m) ?? all[0];
          return { ...src.criteria.find((x) => x.key === cr.key)!, score: m, runs };
        });
        const capped = applyCaps(scoreRole, Object.fromEntries(criteria.map((x) => [x.key, x.score])));
        const floorVotes = all.filter((a) => a.passes_floor).length;
        const stable: RoleScore = {
          total: weightedTotal(rubrics[scoreRole], capped),
          criteria: criteria.map((x) => ({ ...x, score: capped[x.key] })),
          passes_floor: floorVotes * 2 > all.length,
          floor_reason: all.find((a) => a.passes_floor === floorVotes * 2 > all.length)?.floor_reason ?? null,
        };
        for (const id of twins.length ? twins : [r.id]) await upsertScore(id, scoreRole, stable);
      }
    }
  }
}
