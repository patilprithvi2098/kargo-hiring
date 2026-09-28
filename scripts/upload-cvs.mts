// Runs CVs through the same pipeline as the dashboard's Upload button (writes to Supabase).
// Usage: npm run upload -- seed/applications/pm_01_x.pdf:PM seed/applications/05_y.pdf:PM
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { getCandidate } from "../lib/db";
import { processUpload } from "../lib/flow/pipeline";
import type { Role } from "../lib/rubric";

for (const arg of process.argv.slice(2)) {
  const [path, role] = arg.split(":") as [string, Role];
  const t0 = Date.now();
  const id = await processUpload(new File([readFileSync(path)], basename(path)), role);
  const c = await getCandidate(id);
  const s = c?.scores?.[role];
  console.log(
    `${basename(path)} -> ${c?.pipeline_status} in ${((Date.now() - t0) / 1000).toFixed(0)}s` +
      (s ? ` | ${role} ${s.total} ${s.passes_floor ? "" : "(below floor)"} | draft: ${c?.email_type ?? "-"}` : "") +
      (c?.pipeline_error ? ` | ERROR ${c.pipeline_error.slice(0, 200)}` : ""),
  );
}
