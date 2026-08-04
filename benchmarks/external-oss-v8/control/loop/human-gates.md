# Current human gates

## EXPERIMENT_CONTRACT_DECISION

- Status: `BLOCKED_EXPERIMENT_CONTRACT_INCOMPLETE`
- Current main SHA/tree: `12f1802173c05e880139a2841900e6953d16d42d` / `2eee3c5237d3ef7cda947e3cb843eddd50668f69`
- Issue: <https://github.com/Eskasia/governseed/issues/84>
- Draft control PR: <https://github.com/Eskasia/governseed/pull/85>; it remains draft and is not authorized for merge before the decision is complete and rebound to its final reviewed head.
- Completed parent gate: PR `#83` head `f8bdf152c3d0481e4b4a391130f49f7266509efb`, reviewed tree `2eee3c5237d3ef7cda947e3cb843eddd50668f69`, owner approval <https://github.com/Eskasia/governseed/pull/83#issuecomment-5180050104> at `2026-08-04T13:55:12Z`, merge at `2026-08-04T13:56:04Z`, and main CI run `30916308174`.
- Exact target: one repository-owner decision comment on Issue `#84` that supplies all thirteen required preregistration fields and identifies one canonical owner/path for the full P0-P8 experiment.
- Evidence summary: V8 is explicitly limited to G1 external-observational evidence; the V4 lock remains a blocked draft and is not authoritative for V8 or a successor effectiveness revision.
- Risk: inferred run counts, thresholds, tasks, or scoring rules would contaminate preregistration and could invalidate every later Pilot or confirmatory result.
- Authorized human action: post one complete decision comment on Issue `#84`; this authorizes contract implementation and review only.
- Explicitly unauthorized: provider requests, workflow dispatch, G2/G3 execution, formal lock, Pilot, confirmatory execution, scoring execution, final acceptance, or reuse of a prior runtime authorization.
- Expected GitHub evidence: an owner-associated comment with immutable `created_at`, complete field values, canonical owner/path, and explicit implementation-only scope.
- Resume condition: fetch main and Issue `#84`; verify the decision comment predates implementing commits and contains every required field without conflict or range; then implement the contract in an isolated branch and draft PR.
- Claim boundary: decision-gate preparation and P0.4 merge reconciliation only; no experiment contract, runtime, effectiveness, scoring, or acceptance claim.

Paste-ready decision template:

```text
APPROVE EXPERIMENT_CONTRACT_DECISION for Issue #84 on main 12f1802173c05e880139a2841900e6953d16d42d. Canonical owner/path: <owner and repository path>. Experiment ID/revision: <value>. Pilot tasks/count: <exact values>. Confirmatory tasks/count: <exact values>. Baseline definition: <value>. Sole GovernSeed treatment difference: <value>. Randomization/ordering/blinding: <exact values>. Runtime/model/provider/fallback policy: <exact values>. Timeout/token/cost/stop rules: <exact values>. Metrics/effect-size/statistical method/missing-data rules: <exact values>. Scoring schema/aggregation/acceptance threshold/safety vetoes: <exact values>. Evidence retention and hash bindings: <exact values>. Formal-lock, Pilot-to-confirmatory, independent-review, and final-acceptance owners: <values>. Claim boundary: <value>. This approval authorizes implementation and review of the contract only; it does not authorize provider requests, workflow dispatch, G3 formal lock, Pilot, confirmatory execution, scoring execution, or benchmark acceptance.
```
