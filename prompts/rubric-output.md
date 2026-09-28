# Output — Rubric prompt v2 (Steps 1–2; the rubric itself is ../rubric.txt)

## Why this rubric

Arjun's best people did not match a spec. **All five "Exceeds" hires had already done the operational
work Kargo's customers do** (customs, freight documentation, port services, 3PL carrier ops) before joining.
**None of the three "Meets"/"Below" hires had**. That holds across engineering, operations, sales,
customer success and product. The JDs only ask for "curiosity" about operations; the hires show that
having *done* it is what predicts success. Pedigree runs the other way: the most credentialed PM (Vikram:
XLRI MBA, CPO certification, Reforge, conference speaker) is rated "Meets".

## Step 1 — Every pattern tested against all 8 hires

| Pattern | Exceeds (5) | Meets/Below (3) | Separates? |
|---|---|---|---|
| **Hands-on freight/logistics ops work** | 5/5. Rohan: "Managed end-to-end import/export documentation for 180+ shipments monthly". Sunita: Bills of Lading for "200+ import and export shipments monthly". Aditya: "Managed commercial relationships with 25 freight forwarder and NVOCC clients" at JNPT. Meghna: "Prepared and reviewed export documentation". Lavanya: "Managed carrier allocation, capacity planning, and exception management" | 0/3. Vikram: HR-tech PM. Rahul: fintech marketing. Preetham: e-commerce backend | **Yes, strongly** |
| **Works inside the operator's workflow** | 5/5. Rohan: "Work directly with freight forwarding operations teams during integration rollouts". Aditya: "Worked alongside the terminal operations team during peak periods". Meghna: "15–20 active shipments daily". Lavanya: "Running 3 ongoing discovery tracks … with freight forwarder clients". Sunita: "ran staff training, and monitored the first 30 days of go-live" | 0/3 in-workflow. Vikram: "40+ user interviews", which is interviews, not in the workflow. Rahul, Preetham: none | **Yes** (Vikram is the edge case) |
| **Shipped AND killed on evidence** (PMs only) | 1/1. Lavanya: "killed 2 after early usage data showed low adoption" | 0/1. Vikram shipped 12, killed none | Yes, but n=2 |
| **Owns their own loss/failure** | 2/5. Aditya: lost deal, "ran a post-mortem … shared with the team". Lavanya: "Drafted and sent the post-mortem after a 4-hour platform outage". Meghna's crisis was a documentation error she doesn't claim. Sunita's was a vendor's change. Rohan's migration succeeded | 0/3 | Weakly, but cleanly |
| Built something unprompted, adopted | Most (Rohan, Lavanya, Meghna) | **Also** Vikram (PRD template "adopted by the 4-person PM team"), Rahul (case-study programme), Preetham (monitoring dashboard found a ₹12L/month bug) | **No** |
| Mentoring / raised the bar | Rohan, Sunita | **Also** Rahul ("Built a 4-person marketing team from scratch"), Preetham ("Mentored 2 junior engineers") | **No** |
| No layer above / reports to CEO | Rohan, Aditya, Lavanya, Sunita | **Also** Rahul: "no CMO above, reports to CEO" | **No** |
| Quantified outcomes | All | **Also** Vikram ("$180K in incremental ARR"), Rahul ("₹2.4Cr in pipeline") | **No** (minimum bar only) |
| Pedigree / certifications | Low (B.Com, BBA, B.Sc Psych) | Highest in Vikram (XLRI, CPO, Reforge) | **Reversed**, so it's an anti-signal |

## Step 2 — JD leakage check

| Criterion kept | Also in a JD? | Verdict |
|---|---|---|
| Ops-native (has done the work) | Partly. PM JD: "curiosity about how operations work". SPM JD: familiarity is "a genuine advantage" | Kept. The hires show *doing* it, which goes beyond the JD |
| Works inside the operator's workflow | Partly. PM JD success criterion: "in the rooms where the work actually happens" | Kept. 5/5 vs 0/3 on the hire data |
| Ships and kills | **Yes, almost word for word.** PM JD: "shipped things, killed things … in short cycles" | Kept, **labelled JD-sourced**, confirmed by Lavanya vs Vikram (n=2) |
| Owns a loss/failure | No | Kept (2/5 vs 0/3); absent scores 2, which is neutral |
| Integration depth (SPM) | **Yes.** It's the SPM JD's core mandate | Kept, **labelled JD-sourced**. The hires add a cap: Preetham had it without ops grounding and rated Below |
| Hard calls / no layer above (SPM) | **Yes.** SPM JD: "without a layer of senior PMs above you" | **Moved to the SPM floor.** It's a JD requirement that doesn't separate on the hire data (Rahul) |

## Steps 3–5

See `../rubric.txt`:

**PM**

| Criterion | Weight |
|---|---|
| Ops-native | 40 |
| In the operator's workflow | 20 |
| Ships and kills | 20 |
| Owns a loss | 20 |

**SPM**

| Criterion | Weight |
|---|---|
| Ops-native | 35 |
| Integration depth (capped at 3 unless ops-native ≥ 3) | 25 |
| In the operator's workflow | 20 |
| Owns a loss | 20 |

**Also in `rubric.txt`:** the role floors from the JDs, anchors for scores 1–5, verbatim-quote enforcement, interview probes for the patterns that didn't separate, a top-5 recommendation that only produces drafts, and the validation plan.

**Limitations.**
- Only 2 PM hires and no SPM hires.
- The hire folder contains CVs only; there are no interview notes.
- Arjun rated the same people he hired, so the rubric could encode his own bias.
- It has to be validated on the 8 hires first, then checked against interview outcomes.
