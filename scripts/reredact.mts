// Re-derives the AI-safe content of every candidate from the original CV file with the current
// redaction rules, and verifies nothing personal survives. Text only — no AI calls.
import { existsSync, readFileSync } from "node:fs";
import { getCandidate, listCandidates, updateCandidate } from "../lib/db";
import { readCvFile } from "../lib/flow/1-input";
import { assertNoPersonalDetails, separatePersonalDetails } from "../lib/flow/2-context";

let changed = 0, blocked = 0, missing = 0;
for (const c of await listCandidates()) {
  const path = `seed/applications/${c.cv_filename}`;
  if (!existsSync(path)) { missing++; continue; }
  const { rawText } = await readCvFile(new File([readFileSync(path)], c.cv_filename), c.role_applied);
  const { personal, content } = separatePersonalDetails(rawText, c.cv_filename);
  try { assertNoPersonalDetails(content); } catch (e) { blocked++; console.log(`BLOCKED ${c.cv_filename}: ${(e as Error).message}`); }
  const before = (await getCandidate(c.id))?.cv_content;
  if (before !== content) {
    await updateCandidate(c.id, { cv_content: content, phone: c.phone ?? personal.phone });
    changed++;
  }
}
console.log(`re-redacted ${changed} CVs, ${blocked} still blocked, ${missing} source files missing`);
