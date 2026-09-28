// Structured form of rubric.txt (v2). Seeded into Supabase (kh_rubric) by scripts/seed-rubric.mts;
// the app reads the rubric from the database at runtime.
//
// Two layers:
//   JD    -> ROLE_FLOOR (pass/fail): is this the role Kargo needs?
//   Hires -> weighted criteria:      of those, who looks like Kargo's best people?
// A criterion carries weight only if the hire data separates Exceeds from Meets/Below.

export type Role = "PM" | "SPM";

export type Criterion = {
  key: string;
  name: string;
  weight: number;
  source: string;
  definition: string;
  hireEvidence: string;
  anchors: { 5: string; 4: string; 3: string; 2: string; 1: string };
};

export type Rubric = { role: Role; criteria: Criterion[] };

export const ROLE_TITLE: Record<Role, string> = {
  PM: "Product Manager",
  SPM: "Senior Product Manager",
};

const opsNative = {
  key: "ops_native",
  name: "Operations-native (has done the work)",
  source: "Hires — 5 of 5 Exceeds vs 0 of 3 Meets/Below. The JD only asks for 'curiosity' about ops.",
  definition:
    "Time spent DOING hands-on logistics / freight / supply-chain operations work (documentation, customs, port, carrier, " +
    "warehouse, 3PL planning) — not selling to it, consulting on it, or building software for it.",
  hireEvidence:
    "Lavanya (3 yrs 3PL carrier ops before PM), Rohan (3 yrs customs-broker ops), Sunita & Meghna (freight documentation), " +
    "Aditya (port terminal services). None for Vikram (HR-tech PM), Rahul (fintech marketing), Preetham (e-comm backend).",
  anchors: {
    5: "2+ years doing freight/logistics/supply-chain operations work itself",
    4: "1–2 years of that work, or 2+ years hands-on in a closely adjacent ops floor (warehouse, fulfilment, plant ops)",
    3: "Under 1 year hands-on, or clearly ops-heavy adjacent work (field/plant/hospital ops) not in logistics",
    2: "Built or sold software for logistics/ops but never did the operational work",
    1: "No operational exposure",
  },
};

const embedded = {
  key: "embedded_with_operators",
  name: "Works inside the operator's workflow",
  source:
    "Hires — present in all 5 Exceeds; Vikram only ran remote interviews; absent for Rahul and Preetham. Echoes PM JD 'in the rooms where the work happens'.",
  definition:
    "Worked side by side with operational users in their real workflow — on the floor, during rollouts, as their day-to-day contact — " +
    "and changed the product/process from what they saw. Interviews or surveys over calls alone score low.",
  hireEvidence:
    "Rohan (translated field requirements during freight rollouts, no product layer), Aditya (worked alongside terminal ops at peak), " +
    "Meghna (primary contact for 12 shippers, 15–20 live shipments/day), Lavanya (discovery tracks with freight forwarders -> feature pivot), " +
    "Sunita (ran client go-live on site). Vikram: 40+ user interviews over calls. Rahul, Preetham: none.",
  anchors: {
    5: "Repeatedly embedded with operators in their workflow AND a specific change came from it",
    4: "Embedded with operators, change implied but not stated",
    3: "Regular customer/user contact, mostly interviews, calls or account management",
    2: "Occasional customer contact via research or data only",
    1: "No direct contact with end users",
  },
};

const ownsLoss = {
  key: "owns_loss",
  name: "Owns a loss or failure out loud",
  source:
    "Hires — 2 of 5 Exceeds (Aditya, Lavanya) vs 0 of 3 others. Weak but clean signal; absence is common on CVs, so absent = 2 (neutral-low), not 1.",
  definition:
    "The CV names a loss, outage, failed bet or mistake the candidate owned, and what changed afterwards. " +
    "A feature kill counts under 'Ships and kills', NOT here. Fixing someone else's crisis is not owning a failure.",
  hireEvidence:
    "Aditya (4-month freight-forwarder deal lost -> root-cause post-mortem became team practice), Lavanya (4-hour outage -> wrote both " +
    "post-mortems, owned follow-ups). Vikram and Rahul list only wins.",
  anchors: {
    5: "Specific own failure/loss + what they changed + it became a practice for others",
    4: "Specific own failure/loss + what they changed",
    3: "Mentions an incident they owned the response to, but not their own failure",
    2: "No failure mentioned (neutral — verify in interview)",
    1: "Only wins, framed to deflect or blame others where issues appear",
  },
};

export const RUBRICS: Record<Role, Rubric> = {
  PM: {
    role: "PM",
    criteria: [
      { ...opsNative, weight: 40 },
      { ...embedded, weight: 20 },
      {
        key: "ships_and_kills",
        name: "Ships and kills in short cycles",
        weight: 20,
        source:
          "PM JD ('shipped things, killed things… short cycles'), confirmed by hires: Lavanya (Exceeds) shipped 6 and killed 2; Vikram (Meets) shipped 12, killed none. n=2.",
        definition:
          "Shipped things that got used AND stopped things that didn't, on evidence, with the reason written down.",
        hireEvidence: "Lavanya: killed 2 low-adoption features, redirected capacity -> 3x weekly active use in 30 days. Vikram: ship list only.",
        anchors: {
          5: "Shipped + killed/pivoted on usage data, outcome quantified",
          4: "Shipped + a kill/pivot mentioned without data",
          3: "Shipped features with adoption numbers, nothing ever killed",
          2: "Shipped features, no outcomes",
          1: "Roadmap/process language only, nothing concrete shipped",
        },
      },
      { ...ownsLoss, weight: 20 },
    ],
  },
  SPM: {
    role: "SPM",
    criteria: [
      { ...opsNative, weight: 35 },
      {
        key: "integration_depth",
        name: "Integration / data-layer depth",
        weight: 25,
        source:
          "SPM JD (owns carrier/port/ERP integrations). Hires add the condition: Preetham had strong integration skills without ops grounding and rated Below — so this is capped at 3 in code unless ops-native is 3+.",
        definition:
          "Led integrations, migrations, data-quality or reliability work that touches external systems (carriers, ports, ERPs, TMS/FMS, vendors).",
        hireEvidence:
          "Rohan (legacy data-vendor migration, 60% lag cut), Sunita (paper -> cloud FMS migration), Lavanya (carrier integration, first API docs). Preetham: 3PL API integrations but Below.",
        anchors: {
          5: "Led multiple external integrations/migrations with reliability or data-quality outcomes",
          4: "Led one significant external integration/migration",
          3: "Contributed to integrations or owned internal platform work",
          2: "Worked alongside integration work without owning it",
          1: "No integration/platform exposure",
        },
      },
      { ...embedded, weight: 20 },
      { ...ownsLoss, weight: 20 },
    ],
  },
};

/** Rules applied in code after the model scores (prose rules are not reliably followed by a model). */
export function applyCaps(role: Role, scores: Record<string, number>): Record<string, number> {
  const out = { ...scores };
  if (role === "SPM" && (out.ops_native ?? 1) < 3) out.integration_depth = Math.min(out.integration_depth ?? 1, 3);
  return out;
}

export const ANTI_SIGNALS =
  "Give ZERO credit for pedigree, MBA/college brand, certifications, conference talks, LeetCode, tools lists, or framework vocabulary. " +
  "The most credentialed past PM hire (XLRI MBA, CPO cert, Reforge, speaker) was only 'Meets'; a strong-pedigree engineer was 'Below'. " +
  "Also give no credit for 'built something unprompted', 'mentored people' or 'reported to the CEO / no layer above' — the average hires had those too.";

/** Weighted total on a 0–100 scale: a 1 on every criterion = 0, a 5 on every criterion = 100. */
export function weightedTotal(rubric: Rubric, scores: Record<string, number>): number {
  const t = rubric.criteria.reduce((sum, c) => {
    const s = Math.min(5, Math.max(1, scores[c.key] ?? 1));
    return sum + ((s - 1) / 4) * c.weight;
  }, 0);
  return Math.round(t * 10) / 10;
}

export const SHORTLIST_SIZE = 5;
/** An invite needs a real score, not just a top-5 rank in a thin pool (SPM #5 scored 31). */
export const MIN_INVITE_SCORE = 50;
/** Candidates this close to the shortlist line or MIN_INVITE_SCORE are re-scored 3x (median). */
export const BORDERLINE_BAND = 10;

/**
 * Role floor — pass/fail, not weighted. This is where the JD's requirements live.
 * Candidates below the floor still get scored, ranked (below those who pass) and a draft.
 */
export const ROLE_FLOOR: Record<Role, string> = {
  PM:
    "At least 1 year in a product role (PM/APM/product owner, or founder/first-PM doing product work) where the CV " +
    "shows they owned a product or problem area AND at least one shipped outcome with a number. " +
    "Students, freshers, pure marketers, project/delivery managers and pure engineers/analysts do not pass.",
  SPM:
    "At least 4 years of product ownership (not just delivery/project management), AND evidence of making consequential " +
    "product calls with no layer of senior PMs above them (sole/most-senior PM, founding PM, or owned a platform area end-to-end).",
};

/** Candidates who fail the floor but are strong operators — worth a look for ops/CS/solutions roles. */
export const STRONG_OPERATOR_MIN = 4;
