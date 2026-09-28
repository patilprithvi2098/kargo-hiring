// Runs the 8 past-hire CVs through the real pipeline (Input -> Context -> Processing), no DB writes.
// Pass condition: Exceeds hires outscore Meets/Below; Lavanya is the top PM.
// Run: NODE_OPTIONS=--conditions=react-server npx tsx --env-file=.env.local scripts/validate-hires.mts
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { getRubrics } from "../lib/db";
import { readCvFile } from "../lib/flow/1-input";
import { extractProfile, separatePersonalDetails } from "../lib/flow/2-context";
import { scoreBothRoles } from "../lib/flow/3-processing";

const RATING: Record<string, string> = {
  rohan_desai: "Exceeds", sunita_krishnamurthy: "Exceeds", vikram_nair: "Meets", aditya_shetty: "Exceeds",
  preetham_rao: "Below", meghna_tiwari: "Exceeds", lavanya_iyer: "Exceeds", rahul_bose: "Meets",
};
const dir = "seed/hires";
const rubrics = await getRubrics();
const files = readdirSync(dir).filter((f) => f.endsWith(".docx"));

// two at a time — avoids tripping Gemini rate limits
async function mapLimit<T, R>(items: T[], n: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k]); }
  }));
  return out;
}
const rows = await mapLimit(files, 1, async (f) => {
  const file = new File([readFileSync(`${dir}/${f}`)], f);
  const input = await readCvFile(file, "PM");
  const { personal, content } = separatePersonalDetails(input.rawText, f);
  const leaked = [personal.email, personal.phone].filter((x) => x && content.includes(x));
  const profile = await extractProfile(content);
  const s = await scoreBothRoles(profile, content, rubrics);
  const key = f.replace(/^cv_\d+_|\.docx$/g, "");
  console.error(`scored ${personal.name}`);
  return { name: personal.name, rating: RATING[key], s, leaked };
});

rows.sort((a, b) => b.s.PM.total - a.s.PM.total);
const lines: string[] = [];
const fmt = (r: typeof rows[number]) =>
  `${(r.name ?? "?").padEnd(22)} ${r.rating.padEnd(8)} PM ${String(r.s.PM.total).padStart(5)} ${r.s.PM.passes_floor ? "     " : "floor✗"}` +
  `  [${r.s.PM.criteria.map((c) => c.score).join(" ")}]   SPM ${String(r.s.SPM.total).padStart(5)} [${r.s.SPM.criteria.map((c) => c.score).join(" ")}]` +
  (r.leaked.length ? "  PII LEAK!" : "");
lines.push("Ranked by PM score. Criteria order PM [ops embedded ships_kills owns_loss], SPM [ops integration embedded owns_loss]");
rows.forEach((r) => lines.push(fmt(r)));

const exceeds = rows.filter((r) => r.rating === "Exceeds").map((r) => r.s.PM.total);
const others = rows.filter((r) => r.rating !== "Exceeds").map((r) => r.s.PM.total);
const minEx = Math.min(...exceeds), maxOther = Math.max(...others);
const pms = rows.filter((r) => ["Lavanya Iyer", "Vikram Nair"].includes(r.name ?? ""));
lines.push("");
lines.push(`Lowest Exceeds PM score ${minEx} vs highest Meets/Below ${maxOther} -> ${minEx > maxOther ? "PASS: rubric separates all 8" : "OVERLAP"}`);
lines.push(`Among actual PM hires: ${pms.map((p) => `${p.name} ${p.s.PM.total}`).join(" vs ")} -> ${pms[0]?.name === "Lavanya Iyer" ? "PASS" : "FAIL"}`);
lines.push(`Mean PM score: Exceeds ${(exceeds.reduce((a, b) => a + b) / exceeds.length).toFixed(1)}, Meets/Below ${(others.reduce((a, b) => a + b) / others.length).toFixed(1)}`);
lines.push("", "Evidence for the two PM hires:");
for (const p of pms) {
  lines.push(`-- ${p.name}`);
  p.s.PM.criteria.forEach((c) => lines.push(`   ${c.key} ${c.score}${c.capped ? " (" + c.capped + ")" : ""}: ${c.evidence.slice(0, 190)}`));
}
console.log(lines.join("\n"));
writeFileSync("validation-results.txt", `Rubric v2 validation on the 8 past hires — ${new Date().toISOString()}\n\n` + lines.join("\n") + "\n");
