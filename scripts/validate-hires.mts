// Runs the 8 past-hire CVs through the real pipeline (Input -> Context -> Processing), no DB writes.
// Pass condition: Exceeds hires outscore Meets/Below; Lavanya is the top PM.
// Run: NODE_OPTIONS=--conditions=react-server npx tsx --env-file=.env.local scripts/validate-hires.mts
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { getRubrics } from "../lib/db";
import { readCvFile } from "../lib/flow/1-input";
import { extractProfile, separatePersonalDetails } from "../lib/flow/2-context";
import { scoreBothRoles } from "../lib/flow/3-processing";
import { applyCaps, weightedTotal } from "../lib/rubric";

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
  // Same method as the live pipeline for borderline candidates: 3 runs, median per criterion.
  const runs = [await scoreBothRoles(profile, content, rubrics), await scoreBothRoles(profile, content, rubrics), await scoreBothRoles(profile, content, rubrics)];
  const med = (xs: number[]) => [...xs].sort((a, b) => a - b)[1];
  const s = Object.fromEntries((["PM", "SPM"] as const).map((role) => {
    const crit = rubrics[role].criteria.map((cr) => {
      const vals = runs.map((r) => r[role].criteria.find((x) => x.key === cr.key)!);
      const m = med(vals.map((v) => v.score));
      return { ...vals.find((v) => v.score === m)!, score: m, runs: vals.map((v) => v.score), caps: vals.map((v) => v.capped).filter(Boolean) };
    });
    const capped = applyCaps(role, Object.fromEntries(crit.map((c) => [c.key, c.score])));
    const floor = runs.filter((r) => r[role].passes_floor).length >= 2;
    return [role, { total: weightedTotal(rubrics[role], capped), criteria: crit, passes_floor: floor }];
  })) as Record<"PM" | "SPM", { total: number; criteria: { key: string; score: number; evidence: string; runs: number[]; caps: (string | undefined)[] }[]; passes_floor: boolean }>;
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
lines.push("", "Run-to-run spread (PM criteria, 3 runs each):");
for (const r of rows) lines.push(`  ${(r.name ?? "?").padEnd(22)} ${r.s.PM.criteria.map((c) => c.key + " " + c.runs.join("/")).join("  ")}${r.s.PM.criteria.some((c) => c.caps.length) ? "  caps: " + [...new Set(r.s.PM.criteria.flatMap((c) => c.caps))].join("; ").slice(0, 80) : ""}`);
lines.push("", "Evidence for the two PM hires:");
for (const p of pms) {
  lines.push(`-- ${p.name}`);
  p.s.PM.criteria.forEach((c) => lines.push(`   ${c.key} ${c.score} (runs ${c.runs.join("/")}): ${c.evidence.slice(0, 170)}`));
}
console.log(lines.join("\n"));
writeFileSync("validation-results.txt", `Rubric v2.1 validation on the 8 past hires (median of 3 runs per criterion) — ${new Date().toISOString()}\n\n` + lines.join("\n") + "\n");
