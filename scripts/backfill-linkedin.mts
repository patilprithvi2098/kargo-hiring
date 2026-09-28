// Re-reads CV files (text only, no AI) to fill linkedin_url for candidates uploaded before the column existed.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { listCandidates, updateCandidate } from "../lib/db";
import { readCvFile } from "../lib/flow/1-input";
import { linkedinFrom } from "../lib/flow/2-context";

const dir = "seed/applications";
let found = 0;
const files = readdirSync(dir).filter((f) => f.endsWith(".pdf"));
const byFile = new Map<string, string | null>();
for (const f of files) {
  const { rawText } = await readCvFile(new File([readFileSync(`${dir}/${f}`)], f), "PM");
  const url = linkedinFrom(rawText);
  byFile.set(f, url);
  if (url) found++;
}
console.log(`${found} of ${files.length} CVs have a usable LinkedIn handle`);
for (const c of await listCandidates()) {
  if (c.linkedin_url || !existsSync(`${dir}/${c.cv_filename}`)) continue;
  const url = byFile.get(c.cv_filename) ?? null;
  if (url) await updateCandidate(c.id, { linkedin_url: url });
  console.log(`${c.name}: ${url ? "linked" : "no handle on CV"}`);
}
