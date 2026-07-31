# Research Synthesis Workflow

Applies when: the project hits an evidence conflict that would materially change a decision, a high-impact or hard-to-reverse choice, several credible routes, or the user explicitly asks for multi-perspective research.

Does not apply to: a single stable fact, a low-risk reversible choice, an ordinary summary, or a decision that already has clear and sufficient evidence. This is a conditional governance capability, not a research runtime, a multi-agent orchestrator, or a release gate.

## Trigger

Once Q1-Q9 is enough to state the decision problem, and again before any major decision is settled, the agent checks these reason codes:

| Reason code | Trigger signal |
|---|---|
| `explicit-multi-view` | The user explicitly asks for comparison, critique, debate, or multi-perspective analysis |
| `evidence-conflict` | Sources materially conflict on a decision-relevant claim |
| `high-impact-decision` | The decision is costly, hard to reverse, or has major consequences |
| `credible-route-divergence` | At least two credible routes rest on different assumptions |
| `cross-domain-gap` | A cross-domain or cross-period information gap would change the decision |

Propose it only when the signal would materially change scope, acceptance, risk, cost, or route; do not start automatically on a keyword or on general complexity.

## Confirmation

1. Report the detected reason code, which decision it affects, and the risk of skipping this flow.
2. Ask one question only: whether to create `RESEARCH_SYNTHESIS.md`.
3. Only after the user confirms, create the project document from `templates/conditional/RESEARCH_SYNTHESIS.md` and run it.
4. On refusal, do not create an empty document; write the unresolved risk into `OPEN_LOOPS.md` only if the gap also affects an existing gate.

Detection and proposal are not approval. Do not switch modes silently, and do not add a new global hard gate just because `RESEARCH_SYNTHESIS.md` is missing.

`init --all` may pre-copy an empty template; the file existing does not mean anything was detected, confirmed, or completed. Do not fill it in or cite it as decision evidence before the user confirms. Doctor's `present` only means the file exists; when the `Activation Record` has no single explicit `User decision: confirmed` or `User decision: declined`, warn with `RESEARCH_CONFIRMATION_MISSING`, and the strict check must fail. Only `confirmed` starts the research.

## Research Contract

- Mode: material-first hybrid. Use the material the user supplied first; external research only fills recorded, material gaps.
- External sources: prefer official, original research, and first-hand material; record the verification date for any time-sensitive claim.
- Privacy: follow the privacy-safe source attestation in `PROJECT_BRIEF.md`; do not copy private content, sensitive URLs, credentials, or raw tool traces.
- Traceability: every substantive finding links to a `CLM-*`; every claim links to an `SRC-*`, or is explicitly marked inference, professional judgment, or unknown.
- No fabrication: when evidence cannot be found, keep the gap; do not invent citations, quotations, numbers, consensus, or expert identities.
- Boundaries: the five lenses are an analytical frame, not five real experts, and they do not authorize extra tools, model calls, or subagents.

## Five-lens Scan

Complete the five lenses separately before synthesizing, so a conclusion is not reached first and then endorsed by each lens in turn:

1. Practitioner: operational constraints, field feedback, failure modes, cost to land.
2. Scholar: definitions, theory, research quality, causality, alternative explanations.
3. Skeptic: the strongest counter-evidence, evidence gaps, overreach, failure conditions.
4. Economist: incentives, opportunity cost, distributional effects, market structure, second-order effects.
5. Historian: path dependence, comparable precedents, differences in era, false analogies.

Every lens must fill in: core position, strongest supporting evidence, strongest counter-evidence or objection, hidden signals, claim IDs. Where a lens does not apply, fill `not-applicable` with a reason; do not invent content to fill the slot.

## Evidence And Contradiction Rules

- Evidence strength and confidence are assessed separately; a larger number of sources is not automatically better evidence.
- Mark something `strong` only with direct project evidence, or mutually corroborating high-quality primary sources, and no major unresolved conflict.
- Inference and professional judgment may stay, but must be labeled; they cannot be written as verified fact.
- Do not average conflicting views into a false consensus; record each side's claim, evidence, affected lenses, status, and the next distinguishing piece of evidence, item by item.
- External research may only fill in `GAP-*`; it may not expand the original question or quietly rewrite the success criteria.

## Layered Output

`RESEARCH_SYNTHESIS.md` always has two layers:

1. Executive layer: a one-line summary, findings ordered by confidence, recommended actions, frontier questions.
2. Review layer: source and claim ledger, five-lens scan, contradiction map, consensus, gaps, cross-lens connections, self-assessment.

Every recommendation links to a finding and states its reversibility, verification method, and stop / re-evaluate trigger. Research conclusions may only propose candidate updates to `PROJECT_BRIEF.md`, `SPEC.md`, `TECH_STACK.md`, or `OPEN_LOOPS.md`; do not rewrite an existing decision before the user confirms.

## Self-review

- For each finding, identify its weakest evidence, the strongest alternative explanation, the unresolved conflicts, and what new evidence would change the conclusion.
- Use the 0-4 academic-rigor rubric in the template; every score carries evidence and a required improvement.
- Do not claim or simulate a Stanford University identity, endorsement, or a review by a real professor. A transparent rubric replaces authority role-play.
- Self-review can only expose quality and gaps; its own scores are not acceptance, release, or effectiveness evidence.

## Completion

- The reason code and the user's confirmation are recorded.
- The five lenses, claim/source trace, contradiction map, confidence calibration, and self-review are all complete.
- Unresolved gaps and counter-evidence remain visible, with no false consensus or invented sources.
- External gap-filling stayed within the approved scope.
- The canonical project documents took in only the candidate changes the user confirmed.
- This artifact stays advisory; it does not replace `GATE-INTENT-001`, `GATE-ROUTE-001`, tests, acceptance, or release evidence.
