import "server-only";
import { generateJson } from "../gemini";

// COMPONENTS MAP — CONTEXT
// "Extracts candidate info and prepares data (excludes personal details from AI)".
//
// Step 2a (deterministic code, no AI): split personal details from CV content.
//   Name / email / phone / links are pulled out and stored in Supabase; the CV content
//   that continues down the pipeline has them replaced with placeholders.
// Step 2b (AI, on redacted text only): turn the CV into a structured profile.

export type PersonalDetails = {
  name: string | null;
  email: string | null;
  phone: string | null;
  linkedin_url: string | null;
};

// Only a real profile handle counts — many CVs in the pool have a blanked "linkedin.com/in/".
const LINKEDIN_RE = /linkedin\.com\/in\/([A-Za-z0-9_%-]{3,100})/i;

/** Normalised profile URL for the founder to open himself. Never fetched, never sent to the AI. */
export function linkedinFrom(rawText: string): string | null {
  const m = rawText.match(LINKEDIN_RE);
  return m ? `https://www.linkedin.com/in/${m[1].replace(/[-_]+$/, "")}` : null;
}

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
// Phone numbers. Any run of 10+ digits (single spaces/dots/hyphens allowed between them) is treated as a
// phone number. Earlier, narrower patterns leaked real CVs where the number was printed twice or glued
// ("+91 94472 3810494472 38104"). Metrics survive: they use commas/decimals ("₹12,00,000", "99.95%").
const DIGIT_RUN = /\+?\(?\d\)?(?:[ .-]?\(?\d\)?){9,}/g;
const PHONE_PATTERNS = [
  DIGIT_RUN,
  /(?<!\d)0\d{2,4}[ .-]?\d{6,8}(?!\d)/g, // landline with trunk prefix
];
/** Anything that still looks like a phone number or email after redaction blocks the AI call. */
const LEAK_CHECKS: [string, RegExp][] = [
  ["phone number", /\d(?:[ .-]?\d){9,}/],
  ["email address", /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/],
];

export function assertNoPersonalDetails(content: string) {
  for (const [what, re] of LEAK_CHECKS) {
    if (re.test(content)) {
      throw new Error(`Privacy check failed: a ${what} survived redaction, so this CV was NOT sent to the AI`);
    }
  }
}
const URL_RE =
  // no leading \b on the domains: PDFs often glue a URL to the previous word ("productlinkedin.com/in/…")
  /(?:https?:\/\/|www\.)\S+|(?:linkedin\.com|github\.com|behance\.net|flowcv\.me|medium\.com|twitter\.com|\bx\.com)\/\S*/gi;

function titleCase(s: string) {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

/** "pm_01_priya_krishnan.pdf" / "07_aditya_nair.pdf" / "Priya Krishnan CV.pdf" -> "Priya Krishnan" */
export function nameFromFilename(filename: string): string | null {
  const base = filename
    .replace(/\.[^.]+$/, "")
    .replace(/^(s?pm_)?\d+_/i, "")
    .replace(/[_-]+/g, " ")
    .replace(/\b(cv|resume|final|updated|v\d+)\b/gi, "")
    .trim();
  const words = base.split(/\s+/).filter((w) => /^[a-z]+$/i.test(w));
  return words.length >= 1 && words.length <= 4 ? titleCase(words.join(" ").toLowerCase()) : null;
}

export function separatePersonalDetails(
  rawText: string,
  filename: string,
): { personal: PersonalDetails; content: string } {
  const email = rawText.match(EMAIL_RE)?.[0] ?? null;
  const phone = PHONE_PATTERNS.map((re) => rawText.match(re)?.[0]).find(Boolean)?.trim() ?? null;
  const name = nameFromFilename(filename);
  const linkedin_url = linkedinFrom(rawText);

  let content = rawText.replace(EMAIL_RE, "[EMAIL]").replace(URL_RE, "[LINK]");
  for (const re of PHONE_PATTERNS) content = content.replace(re, "[PHONE]");

  if (name && name.replace(/\s/g, "").length >= 3) {
    const escaped = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    content = content.replace(new RegExp(escaped(name).replace(/\s+/g, "\\s+"), "gi"), "[CANDIDATE]");
    for (const token of name.split(" ").filter((t) => t.length >= 3)) {
      content = content.replace(new RegExp(`\\b${escaped(token)}\\b`, "gi"), "[CANDIDATE]");
    }
  }
  return { personal: { name, email, phone, linkedin_url }, content };
}

export type Profile = {
  headline: string;
  total_years: number;
  product_years: number;
  operations_years: number;
  domains: string[];
  operations_exposure: string;
  shipped_and_killed: string[];
  failures_owned: string[];
  unprompted_builds: string[];
  ownership_context: string;
  integrations_platform: string[];
  raised_others: string[];
  concerns: string[];
  // Evidence-first additions (design philosophy): career story, demonstrated scope vs title, impact level.
  timeline: { period: string; role: string; context: string; kind: "ops" | "product" | "other" }[];
  demonstrated_scope: { level: ScopeLevel; evidence: string; title_vs_scope: string };
  impact_level: { level: ImpactLevel; evidence: string };
  evidence_gaps: string[];
};

export type ScopeLevel = "Contributor" | "Owner" | "Cross-functional owner" | "Strategic owner" | "Organisational leader";
export type ImpactLevel = "Activity" | "Output" | "Outcome" | "Business impact";

const strArr = { type: "ARRAY", items: { type: "STRING" } };
const PROFILE_SCHEMA = {
  type: "OBJECT",
  properties: {
    headline: { type: "STRING" },
    total_years: { type: "NUMBER" },
    product_years: { type: "NUMBER" },
    operations_years: { type: "NUMBER" },
    domains: strArr,
    operations_exposure: { type: "STRING" },
    shipped_and_killed: strArr,
    failures_owned: strArr,
    unprompted_builds: strArr,
    ownership_context: { type: "STRING" },
    integrations_platform: strArr,
    raised_others: strArr,
    concerns: strArr,
    timeline: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          period: { type: "STRING" },
          role: { type: "STRING" },
          context: { type: "STRING" },
          kind: { type: "STRING", enum: ["ops", "product", "other"] },
        },
        required: ["period", "role", "context", "kind"],
      },
    },
    demonstrated_scope: {
      type: "OBJECT",
      properties: {
        level: {
          type: "STRING",
          enum: ["Contributor", "Owner", "Cross-functional owner", "Strategic owner", "Organisational leader"],
        },
        evidence: { type: "STRING" },
        title_vs_scope: { type: "STRING" },
      },
      required: ["level", "evidence", "title_vs_scope"],
    },
    impact_level: {
      type: "OBJECT",
      properties: {
        level: { type: "STRING", enum: ["Activity", "Output", "Outcome", "Business impact"] },
        evidence: { type: "STRING" },
      },
      required: ["level", "evidence"],
    },
    evidence_gaps: strArr,
  },
  required: [
    "timeline", "demonstrated_scope", "impact_level", "evidence_gaps",
    "headline", "total_years", "product_years", "operations_years", "domains",
    "operations_exposure", "shipped_and_killed", "failures_owned", "unprompted_builds",
    "ownership_context", "integrations_platform", "raised_others", "concerns",
  ],
};

export async function extractProfile(content: string): Promise<Profile> {
  return generateJson<Profile>({
    system:
      "You extract structured facts from a CV for a hiring team. The CV has personal details replaced by [CANDIDATE], [EMAIL], [PHONE], [LINK]. " +
      "Report only what the CV states — never infer or invent. Quote or tightly paraphrase the CV. Empty array if nothing applies. " +
      "Separate evidence from interpretation: a title, a keyword or a verb like 'led' is not evidence of ownership; a described problem -> decision -> action -> measurable result is. " +
      "Do not include names, contact details, age, gender, religion, or anything identifying.",
    prompt: `Extract the profile.

Field guide:
- operations_years: years spent DOING hands-on operations work (logistics, freight, supply chain, warehouse, port, customs, field or plant ops). Consulting on ops or building software for ops is NOT operations work.
- operations_exposure: one sentence describing that hands-on ops work, or "None".
- shipped_and_killed: things shipped with outcomes, and anything killed/pivoted and why.
- failures_owned: failures, losses, outages, crises the person owned, and what changed after.
- unprompted_builds: things they built or started without being asked, and who adopted them.
- ownership_context: team/company context — were they the sole owner, first of function, or inside a large structured team?
- integrations_platform: integrations, migrations, data-layer, reliability or platform work.
- raised_others: mentees promoted, practices adopted by others.
- concerns: gaps, very short tenures, mismatch with a product role, unverifiable claims.
- timeline: each role, most recent first. period like "2021–2023"; context = company type/industry (e.g. "Series A logistics SaaS", "national 3PL"); kind = ops (hands-on operations work), product (PM/APM/founder doing product), or other.
- demonstrated_scope: the highest ownership level the CV actually DEMONSTRATES (not the title, not verbs like "led"): Contributor -> Owner (owned a product/problem area) -> Cross-functional owner (drove eng+design+business to an outcome) -> Strategic owner (set direction for a product/business area, made trade-offs) -> Organisational leader (shaped a function or led PMs). evidence = the CV line that proves it. title_vs_scope = one sentence on whether the title overstates, matches, or understates the demonstrated scope.
- impact_level: the strongest level of evidence in the CV. Activity ("wrote PRDs") -> Output ("launched X") -> Outcome ("activation +18%") -> Business impact ("₹4.2Cr ARR"). evidence = that line.
- evidence_gaps: what a Kargo PM/SPM would need that the CV does NOT demonstrate, phrased as "X is not demonstrated on the CV" — never "the candidate lacks X". Absence of evidence is not absence of ability.

CV:
"""
${content.slice(0, 16000)}
"""`,
    schema: PROFILE_SCHEMA,
    temperature: 0,
  });
}
