// Re-scores borderline candidates 3x (median), shares scores across duplicate CVs, then re-ranks
// and refreshes recommendations/drafts. Run after a bulk load or a rubric change.
import { listCandidates } from "../lib/db";
import { syncRecommendations } from "../lib/flow/pipeline";
import { rankRole } from "../lib/rank";

for (const role of ["PM", "SPM"] as const) {
  await syncRecommendations(role);
  const ranked = rankRole(await listCandidates(), role);
  console.log(`\n${role}: top 7`);
  for (const r of ranked.slice(0, 7))
    console.log(`  ${r.rank}. ${(r.name ?? "?").padEnd(18)} ${String(r.total).padStart(5)} ${r.recommendation}${r.scores[role]?.criteria[0]?.runs ? "  (3-run median)" : ""}${r.duplicateOf.length ? "  dup of " + r.duplicateOf.join(",") : ""}`);
  const stabilized = ranked.filter((r) => r.scores[role]?.criteria[0]?.runs).length;
  console.log(`  re-scored 3x: ${stabilized}, invites: ${ranked.filter((r) => r.recommendation === "invite").length}`);
}
const all = await listCandidates();
for (const f of ["14_sneha_kulkarni.pdf", "21_aryan_kulkarni.pdf"]) {
  const c = all.find((x) => x.cv_filename === f);
  console.log(`${f}: PM ${c?.scores.PM?.total}`);
}
