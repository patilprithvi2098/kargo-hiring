// Bulk-loads every CV in seed/applications not already in the database, 4 at a time,
// then re-ranks each role once and drafts emails. Role: pm_/spm_ prefix, else PM (the dashboard default).
// Run: NODE_OPTIONS=--conditions=react-server npx tsx --env-file=.env.local scripts/bulk-upload.mts
import { readdirSync, readFileSync } from "node:fs";
import { listCandidates } from "../lib/db";
import { roleFromFilename } from "../lib/flow/1-input";
import { processUpload, syncRecommendations } from "../lib/flow/pipeline";

const dir = "seed/applications";
const done = new Set((await listCandidates()).map((c) => c.cv_filename));
const todo = readdirSync(dir).filter((f) => f.endsWith(".pdf") && !done.has(f)).sort();
console.log(`${todo.length} CVs to process`);
let i = 0, ok = 0, failed = 0;
await Promise.all(Array.from({ length: 4 }, async () => {
  while (i < todo.length) {
    const f = todo[i++];
    const role = roleFromFilename(f, "PM");
    try {
      await processUpload(new File([readFileSync(`${dir}/${f}`)], f), role, { sync: false });
      ok++;
    } catch (e) {
      failed++;
      console.log(`FAILED ${f}: ${(e as Error).message.slice(0, 150)}`);
    }
    if ((ok + failed) % 10 === 0) console.log(`${ok + failed}/${todo.length}`);
  }
}));
console.log(`uploaded ${ok}, failed ${failed}. Re-ranking and drafting emails...`);
await syncRecommendations("PM");
await syncRecommendations("SPM");
const all = await listCandidates();
console.log(`in database: ${all.length}, ready: ${all.filter((c) => c.pipeline_status === "ready").length}, errors: ${all.filter((c) => c.pipeline_status === "error").map((c) => c.cv_filename).join(", ") || "none"}`);
console.log(`drafts: ${all.filter((c) => c.email_status === "draft").length}`);
