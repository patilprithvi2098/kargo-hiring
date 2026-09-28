// Seeds kh_rubric from lib/rubric.ts (+ the full rubric.txt as source text).
// Run: node --env-file=.env.local scripts/seed-rubric.mts
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { RUBRICS } from "../lib/rubric.ts";

const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!);
const source = readFileSync(new URL("../rubric.txt", import.meta.url), "utf8");
for (const role of ["PM", "SPM"] as const) {
  const total = RUBRICS[role].criteria.reduce((s, c) => s + c.weight, 0);
  if (total !== 100) throw new Error(`${role} weights sum to ${total}`);
  const { error } = await sb.rpc("kh_rubric_upsert", {
    p_secret: process.env.KH_DB_SECRET, p_role: role, p_criteria: RUBRICS[role].criteria, p_source: source,
  });
  if (error) throw error;
  console.log(`seeded ${role}: ${RUBRICS[role].criteria.length} criteria, weights = ${total}`);
}
