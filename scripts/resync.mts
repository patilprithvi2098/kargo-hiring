import { syncRecommendations } from "../lib/flow/pipeline";
import { listCandidates } from "../lib/db";
await syncRecommendations("PM");
await syncRecommendations("SPM");
for (const c of await listCandidates())
  console.log(`${(c.name ?? "?").padEnd(16)} ${c.role_applied}  score ${c.scores[c.role_applied]?.total}  floor ${c.scores[c.role_applied]?.passes_floor ? "pass" : "FAIL"}  -> recommend ${c.recommendation}, draft ${c.email_type}: "${c.email_subject}"`);
