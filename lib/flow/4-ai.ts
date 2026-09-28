import "server-only";
import { generateJson } from "../gemini";
import { ROLE_TITLE, type Role, type Rubric } from "../rubric";
import type { Brief, RoleScore } from "../db";
import type { Profile } from "./2-context";

// COMPONENTS MAP — AI
// "Generates interview brief and personalised email (interview invite or rejection)".
// Still PII-free: the email is drafted with a [NAME] placeholder; the real name is
// only filled in at send time, after the founder confirms (lib/flow/5-email.ts).

export type { Brief };

export async function writeBrief(opts: {
  role: Role;
  profile: Profile;
  score: RoleScore;
  rubric: Rubric;
}): Promise<Brief> {
  const lines = opts.score.criteria.map((s) => {
    const c = opts.rubric.criteria.find((c) => c.key === s.key);
    return `- ${c?.name ?? s.key} (${c?.weight}%): ${s.score}/5, confidence ${s.confidence ?? "medium"} — ${s.evidence}`;
  });
  return generateJson<Brief>({
    system:
      "You write interview briefs for a busy founder who decides in under 2 minutes per candidate. " +
      "Plain, specific, no hype, no filler adjectives. Refer to the person as 'the candidate'. Never invent facts beyond what is given. " +
      "Separate what the CV demonstrates from what it does not: say 'not demonstrated on the CV', never 'lacks' or 'cannot'. " +
      "Do not judge whether the person is good — say what the evidence shows and what a human must verify.",
    prompt: `Role applied: ${ROLE_TITLE[opts.role]} at Kargo (logistics SaaS for freight forwarders, Series A, Mumbai).
Weighted score: ${opts.score.total}/100 on a rubric built from Kargo's best past hires.

Rubric scores with evidence:
${lines.join("\n")}

Profile:
${JSON.stringify(opts.profile, null, 1)}

Write:
- summary: exactly 3 sentences — (1) who they are and what they have demonstrably owned, (2) the strongest evidence against the rubric, (3) the most important thing NOT demonstrated on the CV.
- why_ranked: one sentence on why the score landed where it did, tied to the top-weighted criteria (ranks change as more CVs arrive, so do not mention a rank number).
- probes: 3 interview verification cards, targeting low-confidence or least-evidenced criteria first, plus "Tell me about something you killed or lost" if owns_loss is unverified. Each has:
    question — concrete, referencing their actual experience;
    tests — which criterion/claim it verifies;
    strong_answer — what a strong answer contains (specifics a real owner would know);
    red_flag — what would suggest the claim is inflated.
- watch_out: one short sentence on a claim to verify (e.g. title overstating scope), or "None".`,
    schema: {
      type: "OBJECT",
      properties: {
        summary: { type: "STRING" },
        why_ranked: { type: "STRING" },
        probes: {
          type: "ARRAY",
          items: {
            type: "OBJECT",
            properties: {
              question: { type: "STRING" },
              tests: { type: "STRING" },
              strong_answer: { type: "STRING" },
              red_flag: { type: "STRING" },
            },
            required: ["question", "tests", "strong_answer", "red_flag"],
          },
        },
        watch_out: { type: "STRING" },
      },
      required: ["summary", "why_ranked", "probes", "watch_out"],
    },
    temperature: 0.3,
  });
}

export type EmailDraft = { subject: string; body: string };

export async function draftEmail(opts: {
  type: "invite" | "decline";
  role: Role;
  profile: Profile;
}): Promise<EmailDraft> {
  const p = opts.profile;
  const facts = [p.headline, p.operations_exposure, ...p.shipped_and_killed.slice(0, 2), ...p.unprompted_builds.slice(0, 1)]
    .filter((f) => f && f !== "None")
    .join("\n- ");

  const brief =
    opts.type === "invite"
      ? `An invitation to a 45-minute first conversation with Arjun (founder) about the ${ROLE_TITLE[opts.role]} role. ` +
        `Mention ONE specific thing from their background that stood out (from the facts below) and why it matters for Kargo. ` +
        `Ask them to reply with 2–3 slots that work this week or next. In-office Mumbai role — mention it briefly.`
      : `A respectful decline for the ${ROLE_TITLE[opts.role]} role. Thank them, be clear it's a no for this role, ` +
        `acknowledge ONE genuine strength from the facts below, and keep the door open for future roles only if sincere. ` +
        `No scores, no "AI", no rubric language, no false hope, no long apology. Apologise briefly for the slow reply. ` +
        `Never tell them what they lack or are missing — it is about fit for this role right now, not their ability.`;

  return generateJson<EmailDraft>({
    system:
      "You draft short, warm, direct emails from a founder to job applicants. Indian English business tone, no clichés, under 140 words. " +
      "Start the body with 'Hi [NAME],' — keep the literal placeholder [NAME]; never write a real name. " +
      "Sign off exactly:\nArjun Mehta\nFounder, Kargo",
    prompt: `Email purpose: ${brief}

Facts about the candidate (from their CV):
- ${facts || "Applied for the role"}`,
    schema: {
      type: "OBJECT",
      properties: { subject: { type: "STRING" }, body: { type: "STRING" } },
      required: ["subject", "body"],
    },
    temperature: 0.5,
  });
}
