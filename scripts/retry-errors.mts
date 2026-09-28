// Re-runs the AI steps for any candidate stuck in error (or never finished), then re-ranks once.
import { listCandidates, updateCandidate } from "../lib/db";
import { runAiSteps, syncRecommendations } from "../lib/flow/pipeline";

const stuck = (await listCandidates()).filter((c) => c.pipeline_status !== "ready");
console.log(`retrying ${stuck.length}: ${stuck.map((c) => c.cv_filename).join(", ")}`);
for (const c of stuck) {
  try {
    await runAiSteps(c.id, { sync: false });
    console.log(`ok ${c.cv_filename}`);
  } catch (e) {
    await updateCandidate(c.id, { pipeline_status: "error", pipeline_error: (e as Error).message });
    console.log(`FAILED ${c.cv_filename}: ${(e as Error).message.slice(0, 150)}`);
  }
}
await syncRecommendations("PM");
await syncRecommendations("SPM");
const all = await listCandidates();
console.log(`ready ${all.filter((c) => c.pipeline_status === "ready").length}/${all.length}, drafts ${all.filter((c) => c.email_status === "draft").length}`);
