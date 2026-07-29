# GovernSeed Security Policy

## Scope

GovernSeed provides project governance documents, scripts, and agent workflow routing. It does not ship a production application or hosted service.

## Do Not Commit

- API keys, tokens, cookies, private keys, or `.env` files.
- Raw tester identifiers, personal media, face crops, embeddings, or private customer data.
- Production deployment credentials or CI secrets.
- Private prompt text, masked private excerpts, or private source content.
- Raw model stdout/stderr, raw tool traces, environment variables, absolute home paths, or raw diff hunks.
- Logs or evidence artifacts that contain credentials or any prohibited value above.

## Decision And Role Foundation Boundary

- The Milestone 1 core is local and dependency-free. Normal `assess`,
  `deliberate`, `roles`, and `pack` commands do not use the network, execute an
  Agent or model, install a Plugin, read credentials, or write user-global
  configuration.
- Treat every imported deliberation result, role catalog, Pack, override, and
  source-lock record as untrusted input. Exact JSON uses fatal UTF-8 decoding,
  a 1 MiB descriptor-bound, decoded-key duplicate detection, bounded nesting
  and members, closed contracts, and privacy scanning before persistence.
- Every governed path must remain under the real project root. Each path
  component is checked for symlinks, and governed files with multiple hard
  links are rejected; reads use no-follow and post-open identity checks, and
  writes re-check the verified parent before no-replace publication. A changed
  identity or detected link fails closed with no success artifact.
- `.agent-governance/.gitignore` must ignore `local/` before any private staging
  directory is created. On POSIX, local directories/files created by the tool
  use modes `0700`/`0600`. Doctor verifies ignore coverage and symlink status
  without traversing local contents.
- Raw prompts, raw model output, provider sessions, cookies, credentials, and
  traces may never become governance evidence. The only core access to
  `local/` is an explicitly named `deliberate import --file` input, and that
  input must already be a normalized result contract.
- Import always persists `imported`; externally supplied `human-confirmed` or
  confirmation-like data is rejected. Only a separate project-local
  declared-human-confirmation transition may advance the stored result, and it
  must match the canonical decision, plan, and result hashes. This record
  declares confirmation; it does not prove human identity.
- Exported plans and their decision inputs are content-bound. Decision
  revision/hash, plan revision/hash, graph version, and pinned source revision
  must all match on import; mismatch fails closed rather than replaying.
- Role/catalog capability metadata is a request, never a grant. Effective
  permission is the most restrictive meet of project, risk, canonical, and
  enabled-Pack constraints. Packs and overrides may only narrow authority.
- External catalog, Pack, and specialist provenance must exact-match one pinned
  source-lock repository, commit, license, import mode, and hash. Normal
  commands never fetch or update a source.
- Errors and JSON findings expose only a stable code and safe subject. They
  never reflect a matched secret, raw input, provider content, or external
  absolute path.

## Governance Evidence Safety Boundary

- Real execution is synthetic-only. Governance-impact evaluation accepts only clean, committed synthetic scenarios; runtime proof accepts only generated synthetic fixtures. Private, customer, tenant, and production content are prohibited.
- Trace provenance records an approved prompt-template version and privacy-safe metadata, never a runtime prompt body.
- Child output may exist only as bounded in-memory buffers long enough to privacy-scan and parse it. The harness never serializes its minimal environment.
- Only validator-approved, privacy-scanned, normalized closed-schema evidence may persist, and only after child reaping and temporary-state cleanup are proven.
- Privacy-scanner unavailability, output-schema failure, session-persistence uncertainty, or cleanup uncertainty fails closed with a stable code and no artifact. The harness never falls back to a mock or weaker mode.
- Runtime proof is an entrypoint first-response contract smoke test. Governance-impact evaluation is a separate delivery-artifact evidence surface and requires its own claim gate.
- The legacy host Codex adapter still refuses with `SESSION_SAFETY_UNAVAILABLE` because process groups do not prove detached or re-parented descendant containment. Claude remains refused while workspace containment is unproven; Antigravity is unavailable when its executable is missing and otherwise remains refused until non-persistence and containment are proven.
- Linux/Codex OCI Scheme A is implemented behind a credential-free committed preflight receipt and approval-gated manual real workflow, but Criterion 4 remains `BLOCKED` until live Linux/cgroup-v2, `sudoers`/`nsenter`, digest-image provenance, provider, teardown, cleanup, and paired-run evidence exists on the final reviewed commit.

## OCI Credential And Network Boundary

- The preflight workflow has no Environment and no secret reference. Its closed `READY + NOT_EVALUATED` receipt is an observation from one credential-free preflight, not image attestation, secret authorization, paired-run evidence, or a governance claim.
- A human must review and commit the receipt, schema-v2 manifest, policy, and synthetic scenario before the real workflow. The evaluator requires them to be tracked and clean, repeats preflight, and matches exact provenance, model, timeout, manifest boundary, receipt boundary, and fresh observed boundary before it reads `OPENAI_API_KEY`.
- The upstream key remains in an ephemeral host proxy. The container receives only a random attempt-scoped bearer and `http://127.0.0.1:43127/v1`; the key is never placed in container argv or persisted evidence.
- Docker `NetworkMode=none` leaves only container loopback. The approved host invokes the evaluator with a non-root UID and non-root primary GID; relay attachment rejects UID 0 or GID 0. A host process enters only the container network namespace through narrowly reviewed `sudo -n nsenter`, drops to that invoking host UID/GID before executing the relay, listens on loopback, and connects to the host-only Unix-domain socket from the host mount namespace. The UDS is not bind-mounted into the container.
- Relay secrets/configuration are neither argv nor preserved `sudo` environment. The parent sends one bounded closed configuration line through private stdin; the remaining pipe is a lifeline and EOF shuts the relay down. Do not add a secret-bearing `sudoers env_keep` rule.
- The proxy accepts only attempt-bound `POST /v1/responses` requests for the exact model. It requires `store: false`, progressive `stream: true`, no background, no `previous_response_id`, `conversation`, `prompt`, nested item/file/container references, or remote input URLs, strips client identifiers, and allows client-executed tools only. `tool_search` descriptors and replayed calls must explicitly declare client execution.
- The no-server-state client tool loop is bounded to 32 sequential requests, one active request, 1 MiB per request, 4 MiB per response, and one attempt deadline. SSE forwards progressively with backpressure; byte, quota, deadline, relay, proxy, provider, or cleanup uncertainty makes the attempt ineligible.
- `store: false` and no background reduce Responses application-state use but do not prove Zero Data Retention, prevent provider abuse-monitoring retention, or establish live Codex/provider compatibility.

## Reporting

If you find a security issue in the starter scripts, templates, examples, or generated default behavior, open a private security advisory if the repository host supports it. Otherwise, contact the maintainer privately before opening a public issue.

## Expected Review Areas

- `scripts/init.mjs` must not overwrite existing project files without leaving them intact.
- `scripts/doctor.mjs` must not read secrets or print private values.
- Templates should teach projects to record secret names and ownership, not secret values.
- Examples must use placeholder data only.
- Runtime-proof and governance-impact paths must scan before persistence, remove raw temporary data in `finally`, and leave no artifact when cleanup cannot be proven.
- OCI review must verify the exact digest/version/binary hash, receipt and manifest identity, `sudo -n`/`nsenter` command boundary and invoking-UID/GID drop, bounded stdin configuration/lifeline, absence of secret-bearing environment preservation and a container UDS mount, lazy credential ordering, closed request fields/references/tool execution, progressive SSE limits, real netns-to-host-UDS behavior, whole-boundary teardown, and post-attempt cleanup.

## Not Covered

Security review for downstream projects generated from this starter remains the responsibility of each downstream project.
