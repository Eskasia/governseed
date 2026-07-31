# RESEARCH_SYNTHESIS.md

## Activation Record

- Decision question: Should the triage agent execute remediation actions itself, or only draft them for human approval?
- System recommendation: recommended
- Trigger reason codes: `high-impact-decision`, `credible-route-divergence`, `evidence-conflict`
- User decision: confirmed
- Confirmed by role: release-owner-role
- Confirmed at: 2026-07-31
- Research mode: material-first hybrid
- External gap-fill: not-allowed
- Advisory boundary: this synthesis informs decisions; it is not acceptance, release, or effectiveness evidence.

### Trigger Reason Codes

| Code | Material signal | Present | Evidence / note |
|---|---|---|---|
| `explicit-multi-view` | User explicitly requests comparison, critique, or multiple perspectives | no | The comparison was proposed by the system, not requested. |
| `evidence-conflict` | Sources disagree on a decision-relevant claim | yes | The drill log shows faster recovery with auto-restart; the incident review shows two auto-restarts that masked a failing dependency. |
| `high-impact-decision` | The decision is costly, hard to reverse, or high consequence | yes | Widening the action boundary is easy to ship and hard to withdraw once responders rely on it. |
| `credible-route-divergence` | Two or more credible routes depend on different assumptions | yes | Autonomous remediation assumes the runbook is current; draft-only assumes a responder is reachable. |
| `cross-domain-gap` | The decision has a material gap across disciplines or time periods | no | The decision sits within one operations discipline. |

## Executive Layer

### One-sentence Synthesis

- Draft-only is the correct first boundary because the measured benefit of autonomous restart is minutes while its observed failure mode is masking a dependency fault, and that asymmetry cannot be reversed after responders learn to trust the agent.

### Confidence-ranked Findings

| Finding ID | Finding | Confidence | Evidence strength | Source / claim IDs | Decision relevance |
|---|---|---|---|---|---|
| `FND-001` | Auto-restart shortens recovery for genuinely transient faults by a small, bounded amount. | medium | moderate | SRC-401, CLM-001 | Sets the upper bound on what autonomy buys. |
| `FND-002` | Auto-restart has masked a failing dependency at least twice, delaying the real diagnosis. | high | strong | SRC-402, CLM-002 | Identifies the failure mode autonomy introduces. |
| `FND-003` | Most of the first fifteen minutes is spent assembling context, not executing actions. | high | strong | SRC-401, CLM-003 | The benefit sought is available without autonomy. |
| `FND-004` | Responder trust in an assistive tool rises faster than the tool's accuracy is measured. | medium | weak | SRC-403, CLM-004 | Explains why the boundary is hard to withdraw later. |

### Recommended Actions

| Action | Supported by | Reversibility | Verification | Stop / re-evaluate trigger |
|---|---|---|---|---|
| Ship draft-only with a mandatory approval gate | FND-002, FND-003 | reversible | Approval-gate negative test in the golden set | A measured false-suggestion rate below the agreed threshold |
| Label every draft action with its reversibility | FND-001, FND-004 | reversible | Reversibility label coverage check | Responders report the labels do not match reality |
| Measure the false-suggestion rate for a full quarter before revisiting autonomy | FND-004 | reversible | Quarterly review of drill drafts | The measurement period completes |

### Frontier Questions

| Question | Why it matters | Evidence needed | Owner / next step |
|---|---|---|---|
| How stale may the history index be before citations mislead? | A stale citation is confidently wrong under time pressure | Citation resolution against a deliberately aged synthetic index | release-owner-role; tracked as LOOP-402 |
| Does an unanswered approval need escalation? | An expired approval blocks recovery without telling anyone | One drill with a deliberately unanswered approval | operator-role; tracked as LOOP-401 |

## Scope And Sources

- In scope: whether the agent may execute production-changing actions in the first release.
- Out of scope: which model provider to use, and how severity is assigned.
- Material supplied by the user: synthetic drill logs, a synthetic incident review, and a synthetic responder survey.
- Important gaps eligible for external fill: none; external research was not permitted for this decision.

| Source ID | Source class | Privacy-safe pointer | Coverage | Used by claims | Limitations |
|---|---|---|---|---|---|
| `SRC-401` | synthetic | external-record:record-drill-log | Recovery times across seeded drills | CLM-001, CLM-003 | Drills are seeded, so fault variety is narrower than production. |
| `SRC-402` | synthetic | external-record:record-incident-review | Two incidents where restart masked a dependency fault | CLM-002 | Two cases; the rate is not established. |
| `SRC-403` | synthetic | external-record:record-responder-survey | Responder trust and expectation statements | CLM-004 | Self-reported, small sample, no behavioural measure. |

### Source Rules

- Use supplied material first. External research may fill only a recorded important gap and must not silently expand scope.
- Prefer primary, official, or original research sources. Record access date for time-sensitive external material.
- Keep private content out of this file. Use the privacy-safe source attestation and pointer rules from `PROJECT_BRIEF.md`.
- Do not invent citations, evidence, quotations, missing values, or consensus.

## Claim And Evidence Ledger

| Claim ID | Claim | Claim type | Source IDs | Evidence strength | Confidence | What would change the conclusion |
|---|---|---|---|---|---|---|
| `CLM-001` | Auto-restart reduced drill recovery time by a bounded margin. | verified fact | SRC-401 | moderate | medium | A drill set showing a large, consistent margin on non-transient faults. |
| `CLM-002` | Auto-restart masked a failing dependency in two reviewed incidents. | verified fact | SRC-402 | strong | high | A review showing the dependency fault was detected independently and promptly. |
| `CLM-003` | Context assembly, not action execution, dominates the first fifteen minutes. | verified fact | SRC-401 | strong | high | A time breakdown showing execution latency dominates. |
| `CLM-004` | Responders extend trust to an assistive tool before its accuracy is measured. | professional judgment | SRC-403 | weak | medium | A behavioural measure showing trust tracks measured accuracy. |

### Calibration Rules

- Evidence strength describes the support, not how persuasive the wording sounds.
- `strong`: direct project evidence or convergent high-quality primary sources with no material unresolved conflict.
- `moderate`: relevant support with a bounded limitation, dependency, or conflict.
- `weak`: indirect, single-source, analogy-heavy, or materially incomplete support.
- `unverified`: no reviewable support; keep it as a gap, not a finding.
- Confidence is claim-level. Do not use unsupported percentages.
- Every substantive finding must link to at least one claim ID. Inferences and professional judgments must be labeled.

## Five-lens Scan

Each lens is an analytical frame, not a claimed persona, credential, or separate agent. Complete all five rows unless a row is explicitly marked `not-applicable` with a reason.

| Lens | Core position | Strongest supporting evidence | Strongest counterevidence / objection | Hidden signal | Claim IDs |
|---|---|---|---|---|---|
| Practitioner | The bottleneck is context, not clicks; drafting already removes it. | Context assembly dominates the first fifteen minutes | On a genuinely transient fault, waiting for approval wastes the whole benefit | Responders already restart quickly when they are confident; hesitation tracks uncertainty, not latency | CLM-003, CLM-001 |
| Scholar | The two routes optimise different objectives: mean recovery time versus diagnostic accuracy. | The masked-dependency incidents are accuracy failures, not latency failures | Optimising accuracy at the cost of latency is not free either | The drill logs measure only the objective autonomy favours | CLM-001, CLM-002 |
| Skeptic | The recovery-time gain is measured on seeded drills and may not survive real fault variety. | Drill faults are seeded and narrower than production | Two masked-dependency cases are also a small sample | Both sides of this decision rest on small samples; the asymmetry of consequence is what breaks the tie | CLM-001, CLM-002 |
| Economist | The cost of a wrong autonomous action is borne later and by someone else than the cost of a slow approval. | A masked dependency defers cost into a longer, worse incident | Approval delay has a real, immediate cost during a live incident | Draft-only keeps the cost visible to the person who can act on it | CLM-002, CLM-004 |
| Historian | Assistive tools that gain execution rights rarely give them back. | Responder trust rises ahead of measured accuracy | Some systems have narrowed autonomy successfully after incidents | Starting narrow is cheap to widen; starting wide is expensive to narrow | CLM-004 |

### Lens Boundaries

- Practitioner: execution constraints, operational feedback, failure modes, and what survives contact with reality.
- Scholar: definitions, theory, research quality, causality, and competing explanations.
- Skeptic: strongest falsification attempt, missing evidence, incentives to overclaim, and failure conditions.
- Economist: incentives, opportunity cost, distribution effects, market structure, and second-order effects.
- Historian: path dependence, comparable precedents, discontinuities, and false-analogy risk.

## Contradiction Map

| Conflict ID | Claim A | Claim B | Evidence for A | Evidence for B | Affected lenses | Status | Evidence needed |
|---|---|---|---|---|---|---|---|
| `CON-001` | Auto-restart shortens recovery | Auto-restart lengthens the incident by masking the cause | Drill recovery times | Two reviewed incidents | Practitioner, Scholar, Economist | partially-resolved | A fault-type breakdown separating transient from dependency faults |
| `CON-002` | Small samples on both sides make the comparison unreliable | The consequence asymmetry decides it regardless of sample size | Seeded drills, two incidents | Masked faults defer cost into a worse incident | Skeptic, Economist | resolved | None; the decision is reversible and will be re-measured |

### Consensus

| Consensus ID | Shared conclusion | Participating lenses | Evidence boundary | Confidence |
|---|---|---|---|---|
| `CNS-001` | The benefit responders actually want is context assembly, which draft-only already delivers. | Practitioner, Scholar, Economist | Holds for the fault mix present in the drill set | high |
| `CNS-002` | Starting narrow is cheaper to reverse than starting wide. | Skeptic, Economist, Historian | Judgment, not measurement | medium |

### Unresolved Gaps

| Gap ID | Missing or disputed information | Affected findings | Can external research fill it? | Next evidence |
|---|---|---|---|---|
| `GAP-001` | The share of alerts that are genuinely transient | FND-001 | no | A fault-type breakdown from a quarter of drill data |
| `GAP-002` | The false-suggestion rate of the draft itself | FND-004 | no | Quarterly review of drill drafts |

## Cross-lens Connections

| Connection ID | Lenses connected | Hidden relationship | Why one lens alone would miss it | Decision impact |
|---|---|---|---|---|
| `LNK-001` | Historian, Economist | Trust granted early makes the later cost of narrowing autonomy political rather than technical | The economist prices the action; the historian prices the withdrawal | Favours starting narrow |
| `LNK-002` | Practitioner, Skeptic | The drill set measures the objective autonomy favours, so the practitioner's speed argument is partly an artefact of what was measured | The practitioner trusts the drill; the skeptic questions its construction | Downgrades FND-001 to medium confidence |

## Self-review

| Finding ID | Weakest link | Strongest alternative explanation | Unresolved contradiction | Confidence after review |
|---|---|---|---|---|
| `FND-001` | Drill faults are seeded and narrow | The margin comes from fault selection, not from autonomy | CON-001 | medium |
| `FND-002` | Only two reviewed incidents | Those two incidents were unusual and not representative | CON-001 | high |
| `FND-003` | Time breakdown is from drills, not live incidents | Live incidents may shift time into execution | none | high |
| `FND-004` | Self-reported survey with no behavioural measure | Responders state trust they would not act on | none | medium |

### Academic-rigor Rubric

This transparent rubric approximates a demanding academic review. It does not claim Stanford University affiliation, endorsement, or an actual professor review.

| Dimension | Score 0-4 | Evidence for score | Required improvement |
|---|---:|---|---|
| Question and scope clarity | 4 | The question names one decision with two bounded routes | none |
| Source traceability and quality | 2 | Three synthetic sources, all small samples | A fault-type breakdown over a full quarter |
| Claim calibration | 3 | Strength and confidence differ per claim; the judgment claim is labelled | A behavioural measure for CLM-004 |
| Contradiction and counterevidence handling | 3 | Both contradictions are stated, one remains partially resolved | Resolve CON-001 with GAP-001 evidence |
| Decision usefulness and falsifiability | 4 | The recommendation carries a stated re-evaluation trigger and verification | none |
| **Total / 20** | 16 | Usable for a reversible decision with a scheduled re-measurement | Close GAP-001 before revisiting autonomy |

Score meaning: `0` absent, `1` seriously deficient, `2` usable with material gaps, `3` strong with bounded gaps, `4` review-ready with explicit limitations.

## Completion Checklist

- [x] The user-confirmed activation and trigger reasons are recorded.
- [x] All five lenses contain a core position, strongest evidence, counterevidence, and hidden signal.
- [x] Every substantive finding links to claim and source IDs or is marked unverified.
- [x] Evidence strength and confidence are calibrated separately.
- [x] Contradictions remain visible until evidence resolves them.
- [x] External research, if used, fills only recorded important gaps.
- [x] Recommendations include verification and stop / re-evaluate triggers.
- [x] Self-review identifies weak links and alternative explanations.
- [x] Canonical project decisions are updated only after user confirmation.
