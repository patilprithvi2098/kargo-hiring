import "server-only";
import { generateJson } from "../gemini";
import { ANTI_SIGNALS, ROLE_FLOOR, applyCaps, weightedTotal, type Role, type Rubric } from "../rubric";
import type { CriterionScore, RoleScore } from "../db";
import type { Profile } from "./2-context";

// COMPONENTS MAP — PROCESSING
// "Scores candidate against PM and SPM rubrics (both roles)".
// The model reads the evidence and gives a 1–5 per criterion with a quote.
// The arithmetic (weights, totals, ranks, recommendation) is plain code, so it is
// deterministic and auditable — the AI never decides who is on the shortlist.

const ROLE_SCORE_SCHEMA = {
  type: "OBJECT",
  properties: {
    floor: {
      type: "OBJECT",
      properties: { passes: { type: "BOOLEAN" }, reason: { type: "STRING" } },
      required: ["passes", "reason"],
    },
    criteria: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          key: { type: "STRING" },
          score: { type: "INTEGER" },
          quote: { type: "STRING" },
          reasoning: { type: "STRING" },
          confidence: { type: "STRING", enum: ["high", "medium", "low"] },
        },
        required: ["key", "score", "quote", "reasoning", "confidence"],
      },
    },
  },
  required: ["floor", "criteria"],
};

type Confidence = "high" | "medium" | "low";

type RawRoleScore = {
  floor: { passes: boolean; reason: string };
  criteria: { key: string; score: number; quote: string; reasoning: string; confidence: Confidence }[];
};

function rubricText(r: Rubric) {
  return r.criteria
    .map(
      (c) =>
        `- key "${c.key}" — ${c.name} (${c.weight}%): ${c.definition}\n` +
        ([5, 4, 3, 2, 1] as const).map((n) => `    ${n} = ${c.anchors[n]}`).join("\n"),
    )
    .join("\n");
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9%₹$]+/g, " ")
    .trim();

/** True if the quote really appears in the CV (whitespace/punctuation-insensitive). */
export function quoteInCv(quote: string, cvNorm: string): boolean {
  const q = norm(quote);
  if (q.length < 8) return false;
  if (cvNorm.includes(q)) return true;
  // tolerate small model edits: every 6-word window of the quote must appear, allowing one miss
  const words = q.split(" ");
  if (words.length < 6) return false;
  let misses = 0;
  for (let i = 0; i + 6 <= words.length; i += 3) {
    if (!cvNorm.includes(words.slice(i, i + 6).join(" "))) misses++;
  }
  return misses <= 1;
}

export async function scoreBothRoles(
  profile: Profile,
  content: string,
  rubrics: Record<Role, Rubric>,
): Promise<Record<Role, RoleScore>> {
  const raw = await generateJson<{ PM: RawRoleScore; SPM: RawRoleScore }>({
    system:
      "You are a calibrated hiring assessor for Kargo, a Series A logistics SaaS for freight forwarders. " +
      "Score a CV against two rubrics derived from the company's best past hires. Use the 1–5 anchors strictly. " +
      "Score from the CV text itself; the structured profile is only a hint and may omit evidence. " +
      "For every score, 'quote' must be copied WORD FOR WORD from the CV text (max 30 words) — it is checked by code, and " +
      "paraphrased quotes are rejected. Put your interpretation in 'reasoning'. If the CV has no evidence, leave quote empty " +
      "and use the anchor that describes absence. PM rubric: a feature kill counts under ships_and_kills, not owns_loss. " +
      "SPM rubric (no ships_and_kills criterion): a kill of the candidate's own bet with a stated reason counts under owns_loss. " +
      "Absence of evidence is not absence of ability: write 'Not demonstrated on the CV', never 'the candidate lacks'. " +
      "confidence = how clearly the CV supports the score: high (explicit, specific, with outcome), medium (clear but thin or indirect), low (inferred or ambiguous). " +
      ANTI_SIGNALS,
    prompt: `PM ROLE FLOOR (pass/fail): ${ROLE_FLOOR.PM}
PM RUBRIC:
${rubricText(rubrics.PM)}

SPM ROLE FLOOR (pass/fail): ${ROLE_FLOOR.SPM}
SPM RUBRIC:
${rubricText(rubrics.SPM)}

Structured profile (an earlier AI summary — it CAN MISS THINGS. Use it only to navigate. Score from the full CV
below, and read the whole CV before scoring any criterion as absent):
${JSON.stringify(profile, null, 1)}

CV (personal details redacted):
"""
${content.slice(0, 16000)}
"""

For PM and for SPM: decide the role floor (one-sentence reason), then return one entry per criterion key.`,
    schema: {
      type: "OBJECT",
      properties: { PM: ROLE_SCORE_SCHEMA, SPM: ROLE_SCORE_SCHEMA },
      required: ["PM", "SPM"],
    },
    temperature: 0,
  });

  const cvNorm = norm(content);
  const out = {} as Record<Role, RoleScore>;
  for (const role of ["PM", "SPM"] as Role[]) {
    const byKey = new Map((raw[role]?.criteria ?? []).map((s) => [s.key, s]));
    const scored = rubrics[role].criteria.map((c) => {
      const s = byKey.get(c.key);
      let score = Math.min(5, Math.max(1, Math.round(s?.score ?? 1)));
      const quote = (s?.quote ?? "").trim();
      const verified = quote ? quoteInCv(quote, cvNorm) : false;
      // A score above "absent" must be backed by a quote that is really in the CV.
      const rejected = !verified && score > 2;
      if (rejected) score = 2;
      const confidence: Confidence = !quote || rejected ? "low" : (s?.confidence ?? "medium");
      return { key: c.key, score, quote, verified, rejected, confidence, reasoning: s?.reasoning ?? "" };
    });
    const capped = applyCaps(role, Object.fromEntries(scored.map((c) => [c.key, c.score])));
    const criteria: CriterionScore[] = scored.map((c) => ({
      key: c.key,
      score: capped[c.key],
      evidence: c.quote
        ? `“${c.quote}” — ${c.reasoning}`
        : /^not demonstrated/i.test(c.reasoning)
          ? c.reasoning
          : `Not demonstrated on the CV. ${c.reasoning}`.trim(),
      verified: c.verified,
      confidence: c.confidence,
      capped: c.rejected
        ? "Quote not found word-for-word in the CV — capped at 2"
        : capped[c.key] !== c.score
          ? "Capped at 3: integration depth without ops grounding (Preetham rule)"
          : undefined,
    }));
    out[role] = {
      total: weightedTotal(rubrics[role], capped),
      criteria,
      passes_floor: raw[role]?.floor?.passes ?? true,
      floor_reason: raw[role]?.floor?.reason ?? null,
    };
  }
  return out;
}

export { rankRole, recommendationFor, type Ranked } from "../rank";
