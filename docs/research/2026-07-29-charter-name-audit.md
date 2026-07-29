# Charter Name Collision Audit

Date checked: 2026-07-29 (Asia/Taipei)

Status: **blocked**

This is a preliminary open-source naming screen, not a legal trademark
clearance or an opinion on registrability. The proposed `Charter` display brand
should not be adopted: multiple active products already use the identical name
for local-first AI-agent or repository governance tooling, including overlapping
CLI verbs.

## Scope and Queries

The screen used public, unauthenticated result surfaces where possible. A `404`
or registry `E404` means that no public object was returned at query time; it
does not reserve a name, prove ownership, or rule out a private or unindexed
object.

| Surface | Queries |
|---|---|
| GitHub REST API | `Eskasia/charter`, `Eskasia/agent-charter` |
| npm registry | `charter`, `agent-charter`, `@eskasia/charter` |
| General web search | `"Charter AI governance"`, `"Charter agent governance"`, `"Eskasia Charter"`, `Charter AI governance software agent governance` |
| USPTO Trademark Search | `CHARTER`, `CHARTER GOVERNANCE`, with attention to software and technical-service classes |
| WIPO Global Brand Database | `CHARTER`, `CHARTER GOVERNANCE` |
| EUIPO eSearch / TMview | `CHARTER`, `CHARTER GOVERNANCE` |

## Direct Product Conflicts

| Existing use | Evidence | Why it conflicts |
|---|---|---|
| [Charter Governance](https://charteragent.ai/) ([source repository](https://github.com/germpharm/charter), [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=germpharm.charter-governance)) | The project describes itself as a local-first, open-source AI governance layer. Its public material uses the `charter` CLI and includes bootstrap/generate/audit behavior and AI adapters. The public repository was created 2026-02-16 and is active under Apache-2.0. | Exact display name, AI governance category, local-first positioning, coding-agent audience, and overlapping CLI surface. |
| [use-charter/charter](https://github.com/use-charter/charter) ([product site](https://use-charter.dev/)) | The project describes Charter as an offline, deterministic AI-agent-readiness scanner for repositories. Its documented commands include `charter init` and `charter doctor`, with stable findings and CI gating. | Exact display name plus unusually close repository-governance, deterministic/offline, coding-agent, `init`, and `doctor` semantics. |
| [Stackbilt Charter](https://github.com/Stackbilt-dev/charter) | The project describes itself as a local-first AI-agent governance CLI. It documents `charter doctor`, `charter validate`, `charter audit`, JSON output, stable exit codes, agent context generation, and an MCP surface. npm publishes its CLI as [`@stackbilt/cli`](https://www.npmjs.com/package/@stackbilt/cli). | Exact display and CLI name, same developer-tooling channel, and overlapping local governance, validation, doctor, and agent-context concepts. |

Other adjacent uses found during the screen include
[CharterPoint.ai](https://charterpoint.ai/) and
[CharterLedger](https://charterledger.com/). They are not needed to reach the
decision: the three direct conflicts above already cross the stop threshold.

## GitHub and npm Availability

| Candidate | Observed result | Interpretation |
|---|---|---|
| `github.com/Eskasia/charter` | Public GitHub API returned `404`. | No public repository was visible; availability is not guaranteed. |
| `github.com/Eskasia/agent-charter` | Public GitHub API returned `404`. | No public repository was visible; availability is not guaranteed. |
| npm `charter` | Published as version `0.0.2`, described as a Node.js library for Charter App. | The unscoped npm name is already occupied. |
| npm `agent-charter` | Registry returned `E404`. | No public package was found; publishability is not guaranteed. |
| npm `@eskasia/charter` | Registry returned `E404`. | No public package was found; scope ownership and publishability still require an authenticated check. |

The proposed technical names being apparently unused would not resolve the
display-brand and CLI-category confusion.

## Trademark Search Limits

- [USPTO Trademark Search](https://tmsearch.uspto.gov/search/search-information)
  loaded only its JavaScript search surface in this environment. USPTO Open
  Data access also requires an authenticated account as of 2026-06-18, so no
  reproducible result set was captured.
- [WIPO Global Brand Database](https://branddb.wipo.int/branddb/en/) was
  blocked by its interactive/CAPTCHA flow.
- [EUIPO eSearch](https://euipo.europa.eu/eSearch/) and TMview exposed only
  their interactive front ends; no stable result set was captured.
- This screen did not assess common-law priority, confusing similarity by
  jurisdiction or class, pending unpublished applications, company-name
  rights, domains, or counsel's risk analysis.

Trademark database work therefore remains `needs-human-review`. That
limitation does not change the overall `blocked` result because the observed
market and product conflicts are independently sufficient.

## Confusion Risk

| Dimension | Risk | Evidence |
|---|---|---|
| Display name | High | Three active same-category tools use `Charter`. |
| Product category | High | All address AI agents, repository governance, or both. |
| CLI semantics | High | Existing products already expose `charter init`, `charter doctor`, validation, audit, or generation. |
| Distribution | High | Charter-branded packages, binaries, a VS Code extension, websites, and GitHub repositories already exist. |
| Legal clearance | Unknown | Official trademark result sets were not reproducibly available and counsel has not reviewed the mark. |

## Alternatives Requiring Human Selection

These are lower-collision candidates from the same preliminary screen, not
cleared marks. Each must receive a fresh authenticated namespace check and a
formal trademark search before public adoption.

| Candidate | Suggested repository | Suggested npm package | Collision evidence |
|---|---|---|---|
| **Eskasia StewardSpec** (recommended for the next audit) | `Eskasia/steward-spec` | `@eskasia/steward-spec` | Exact searches for `"Eskasia StewardSpec"`, `"StewardSpec" "AI governance"`, and `site:github.com "steward-spec"` found no same-domain product. The public GitHub query returned `404`; npm returned `E404`. The name describes a governance specification without claiming runtime enforcement. |
| **Eskasia GovernSeed** | `Eskasia/governseed` | `@eskasia/governseed` | Exact searches for `"Eskasia GovernSeed"` and `"GovernSeed" "AI governance"` found no same-domain product. The public GitHub query returned `404`; npm returned `E404`. The bootstrap metaphor fits the current product boundary, but the coined term needs pronunciation and trademark review. |
| **Eskasia NormWeave** | `Eskasia/normweave` | `@eskasia/normweave` | Exact searches for `"Eskasia NormWeave"` and `"NormWeave" "AI governance"` found no same-domain product; only an unrelated historical basket-name occurrence appeared. The public GitHub query returned `404`; npm returned `E404`. Always using the Eskasia-qualified form would reduce generic-name ambiguity. |

## Decision and Required Action

Final preliminary determination: **blocked**.

- Do not change the public brand to `Charter`.
- Do not create `agent-charter`, publish `@eskasia/charter`, add a `charter` CLI
  alias, or initiate a repository rename.
- Keep all current public and machine identifiers unchanged until a human
  selects a new candidate and authorizes a new name audit.
- No conclusion in this document grants trademark rights or guarantees future
  GitHub, npm, domain, or company-name availability.
