// Re-runs Processing (both rubrics) + the brief for every candidate after a rubric change,
// then re-stabilises borderline scores (3-run median) and refreshes recommendations/drafts.
import { getCandidate, getRubrics, listCandidates, updateCandidate, upsertScore } from "../lib/db";
import type { Profile } from "../lib/flow/2-context";
import { scoreBothRoles } from "../lib/flow/3-processing";
import { writeBrief } from "../lib/flow/4-ai";
import { syncRecommendations } from "../lib/flow/pipeline";

const rubrics = await getRubrics();
const all = (await listCandidates()).filter((c) => c.pipeline_status === "ready" && c.email_status !== "sent");
const before = new Map(all.map((c) => [c.id, { PM: c.scores.PM?.total, SPM: c.scores.SPM?.total, name: c.name, role: c.role_applied }]));
let i = 0;
await Promise.all(Array.from({ length: 4 }, async () => {
  while (i < all.length) {
    const c = await getCandidate(all[i++].id);
    if (!c?.cv_content || !c.profile) continue;
    const profile = c.profile as unknown as Profile;
    const s = await scoreBothRoles(profile, c.cv_content, rubrics);
    await upsertScore(c.id, "PM", s.PM);
    await upsertScore(c.id, "SPM", s.SPM);
    const brief = await writeBrief({ role: c.role_applied, profile, score: s[c.role_applied], rubric: rubrics[c.role_applied] });
    await updateCandidate(c.id, { brief });
  }
}));
console.log(`re-scored ${all.length}; stabilising borderline and refreshing recommendations...`);
await syncRecommendations("PM");
await syncRecommendations("SPM");
const after = await listCandidates();
const moved = after
  .map((c) => ({ c, b: before.get(c.id) }))
  .filter(({ c, b }) => b && Math.abs((c.scores[c.role_applied]?.total ?? 0) - (b[c.role_applied] ?? 0)) >= 8)
  .map(({ c, b }) => `${c.name} (${c.role_applied}) ${b![c.role_applied]} -> ${c.scores[c.role_applied]?.total}`);
console.log(`applied-role score moved 8+ points: ${moved.length}\n  ${moved.join("\n  ")}`);
