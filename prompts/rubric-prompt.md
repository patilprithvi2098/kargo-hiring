# Checkpoint L4·1 — Rubric prompt (v2)

Attach: the 8 hire CVs (hires/) and the 2 JDs (jds/). Then send:

```
I'm building a CV-screening rubric for Kargo, a Series A logistics SaaS in Mumbai (software for
mid-sized freight forwarders: shipment tracking, documentation, carrier coordination). Founder Arjun
is hiring a Product Manager (PM) and a Senior Product Manager (SPM). In 11 weeks: 60 applications,
19 opened, 0 offers. He screens against the JDs on gut feel. His brief says: "the spec describes the
role — it does not predict who will succeed in it. His past hires had something in common that the
spec never asked for."

Attached: 8 past-hire CVs and the 2 JDs. Current ratings:
| Name                 | Role                     | Rating  |
| Rohan Desai          | Head of Engineering      | Exceeds |
| Sunita Krishnamurthy | Operations Lead          | Exceeds |
| Vikram Nair          | Product Manager          | Meets   |
| Aditya Shetty        | Sales Lead               | Exceeds |
| Preetham Rao         | Backend Engineer         | Below   |
| Meghna Tiwari        | Customer Success Manager | Exceeds |
| Lavanya Iyer         | Product Manager          | Exceeds |
| Rahul Bose           | Growth & Marketing Lead  | Meets   |

Use two layers, and keep them separate:
- The JDs decide the ROLE FLOOR (pass/fail): is this person the role Kargo needs?
- The HIRES decide the RANKING WEIGHTS: of those, who looks like Kargo's best people?

STEP 1 — Test every candidate pattern against ALL 8 hires.
For each pattern you consider, count how many Exceeds hires show it and how many Meets/Below hires
show it, quoting the CV line each time. Include the counterexamples — do not leave out a Meets/Below
hire who also has the trait. A pattern only earns weight if it SEPARATES the groups.
Test at least: hands-on operations experience, working inside the user's workflow, shipping and
killing features, owning a failure, building things unprompted, mentoring, having no layer above /
reporting to the CEO, quantified outcomes, pedigree and certifications.

STEP 2 — Check for JD leakage.
For each pattern that separates, say whether it also appears in a JD. If it does, say so openly;
keep it only if the hire data confirms it.

STEP 3 — Design the rubrics.
- PM and SPM, 4–6 criteria each, weights summing to exactly 100%.
- Label every criterion's SOURCE (hires, JD, or both) with the Exceeds vs Meets/Below count.
- Give scoring anchors for all five levels (1, 2, 3, 4, 5) so an AI scores consistently.
- Most CVs never mention failures, so say how to score "absent" without punishing normal CV writing.
- Anything that doesn't separate gets zero weight; list those as anti-signals or interview probes.
- Any rule that depends on another criterion (e.g. "only counts with X") must be written as an
  explicit numeric cap, not prose.

STEP 4 — Role floor from the JDs (pass/fail, not weighted), for PM and SPM separately.

STEP 5 — Rules and honesty.
- Score formula (0–100 from 1–5 scores). Score everyone against BOTH rubrics; flag a better fit.
- Every score above "absent" must quote the CV word for word.
- The system only recommends: top 5 per role -> draft invite; the rest -> draft decline. Arjun makes
  every decision and confirms every send. Nothing is auto-rejected or auto-sent.
- State the limitations: sample sizes (how many PMs? any SPMs?), and how to validate the rubric
  (score the 8 hires first: Exceeds should outscore the rest).

Output a "Why this rubric" summary, then the full rubric as plain text I can save as rubric.txt.
```

## Output

The output of this prompt is `rubric-output.md` (analysis, Steps 1–2) + `../rubric.txt` (the rubric, Steps 3–5).
