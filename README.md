# Kargo Hiring Dashboard (MESA C4 · Case 2)

Ranked PM / SPM shortlist with evidence, interview briefs and draft emails.
**The system recommends. Arjun decides.** No email is ever sent without a per-candidate "Confirm & send".

## Components Map → code

| Map column | Code |
|---|---|
| Trigger + Input — founder uploads CV + role | `app/api/upload/route.ts`, `lib/flow/1-input.ts` |
| Context — extract, strip personal details before AI | `lib/flow/2-context.ts` |
| Processing — score against PM and SPM rubrics | `lib/flow/3-processing.ts`, `lib/rank.ts` |
| AI — interview brief + personalised draft email | `lib/flow/4-ai.ts` |
| Email service — Resend, only on founder's click | `lib/flow/5-email.ts`, `app/api/candidates/[id]/send/route.ts` |
| Output — dashboard | `app/page.tsx`, `components/Dashboard.tsx` |

Rubric: `rubric.txt` (v2, council-reviewed) · structured in `lib/rubric.ts` · stored in Supabase `kh_rubric`.
Prompt used to derive it: `prompts/rubric-prompt.md` · output: `prompts/rubric-output.md`.

## Setup
1. `cp .env.example .env.local` and fill it in.
2. Apply `supabase/migrations/*.sql` to the Supabase project.
3. `npm run seed:rubric` · `npm run validate:hires` · `npm run dev`
