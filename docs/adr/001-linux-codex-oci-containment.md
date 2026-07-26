# ADR-001: Linux Codex OCI Containment

## Status

Accepted on 2026-07-26 and implemented behind fail-closed, manual controls.
Acceptance and implementation do not open Criterion 4 or establish live
provider evidence. Operational status remains `BLOCKED` until the evidence
listed under “Required tests before unlock” exists on the final reviewed
commit.

## Context

The shipped real governance-impact adapters fail closed because host process
groups cannot prove containment of `setsid` or re-parented descendants. The
real Codex path needs an execution boundary that can prove all descendants are
gone before evidence is persisted, keep the upstream credential outside the
agent boundary, and preserve the existing oracle-before-workspace-cleanup
integrity contract.

The approved scope is deliberately narrow:

- only Codex on a disposable Linux host with cgroup v2 may become eligible;
- Claude, Antigravity, macOS, and Windows remain fail-closed;
- public CI remains offline and forced-mock;
- GitHub Environment approval authorizes access to the runtime credential but
  is not containment evidence;
- this repository does not publish a runtime image.

## Decision

### Trusted boundary

The route trusts the disposable Linux kernel, cgroup v2, and Docker daemon.
Each attempt runs in a dedicated, non-privileged container with private PID
and cgroup namespaces, a non-root user, a read-only root filesystem,
`cap-drop=ALL`, `no-new-privileges`, PID/CPU/memory limits, no Docker socket,
no devices, and no mounted cgroup filesystem. Only the synthetic arm
workspace and narrowly required runtime surfaces may be mounted.

Docker labels are resource-inventory metadata, not containment proof. The host
supervisor obtains the real cgroup path from the container init process's host
PID and `/proc/<pid>/cgroup`. The authoritative empty-boundary observation is
`cgroup.events` reporting `populated 0`. A missing cgroup path is acceptable
only after the container was observed stopped and the kernel-enforced cgroup
removal was independently observed. Any ambiguity is fail-closed.

### Descendant and crash handling

The container entrypoint is PID 1 and acts as a watchdog. Codex is its child.
The host supervisor is the sole writer of a bind-mounted FIFO lifeline. An
evaluator disconnect, abort, timeout, normal child completion, or supervisor
death closes the writer. PID 1 exits on EOF; Linux then terminates all
processes in that PID namespace, including `setsid` and re-parented
descendants.

Before accepting a new run, the supervisor reconciles resources carrying its
managed-label namespace. An uncertain leftover blocks the new run. Workflow
finalization may perform another cleanup attempt, but it cannot retroactively
make failed evidence valid.

A child timeout or non-zero exit remains safe delivery evidence when the
containment, oracle, privacy, and cleanup proofs all succeed. It is not by
itself a containment failure.

### Network and credential delivery

The container uses Docker `NetworkMode=none`, leaving only loopback. The host
Unix-domain socket is not bind-mounted into the container. After the container
init host PID is known, the supervisor starts:

```text
sudo -n nsenter --net=/proc/<init-pid>/ns/net -- \
  <node> scripts/governance-impact-uds-relay.mjs
```

The relay is a host process that listens on `127.0.0.1:43127` inside the
container network namespace while retaining the host mount namespace. It can
therefore reach the ephemeral host-only UDS without exposing that filesystem
object to the container. Relay readiness is required before PID 1 releases
Codex. Relay configuration and secrets are not passed in argv or inherited
through a preserved `sudo` environment. The parent writes one bounded closed
configuration line to the relay's private stdin; after that line, the same pipe
is a lifeline and EOF initiates relay shutdown. No `sudoers env_keep` is needed
or allowed for relay secrets.

The host proxy alone receives `OPENAI_API_KEY`. The container receives a
random, attempt-scoped bearer in its environment, never in argv. The proxy
enforces the exact bearer and attempt, method, endpoint, model, upstream,
request and response byte limits, request count, deadline, and single
concurrency. It records no request body, response body, authorization header,
or token. Ending the attempt invalidates the bearer and removes the socket.
Proxy uncertainty, quota violation, replay, or privacy uncertainty produces no
candidate artifact.

The provider surface is restricted to at most 32 sequential
`POST /v1/responses` calls per attempt, with at most one active call. Every
request is capped at 1 MiB, every response at 4 MiB, and all calls share the
attempt deadline. Requests require `store: false`, `stream: true`, and
`background` absent or `false`. `previous_response_id`, `conversation`, and
`prompt` are forbidden. Client identifier fields are stripped. Only
client-executed `function`, `custom`, `local_shell`, `apply_patch`, and
`tool_search` tools may pass; hosted server-side tools are rejected.

This permits a bounded client replay loop: Codex can execute an allowed tool
and submit the next self-contained request, but it cannot continue through
provider-held response, conversation, or prompt state. Live Codex/provider
compatibility with that loop remains unproven until an authorized real run
demonstrates it.

SSE is forwarded progressively through the UDS proxy and loopback relay with
backpressure, a cumulative response-byte limit, and the attempt deadline.
Non-SSE responses are bounded before forwarding. A limit or transport failure
after stream headers closes the stream and makes the attempt ineligible.

The upstream credential is resolved lazily. Credential-free preflight,
receipt/manifest comparison, and fresh boundary comparison happen first. Only
an exact match permits credential access and creation of an attempt-scoped
proxy. A match does not establish Zero Data Retention; the provider's own data
controls remain independently applicable.

### Image ABI and observed identity

The operator must supply an already reviewed provenance record containing:

- an OCI reference in the form
  `registry/repository@sha256:<64-lowercase-hex>`;
- `expectedCodexVersion`, defined as the exact, single, non-empty UTF-8 line
  produced on stdout by `/opt/governance/runtime/codex --version` after
  trimming surrounding whitespace, with empty, multiline, or stderr output
  rejected;
- `expectedCodexBinarySha256`, defined as the lowercase SHA-256 of the raw
  bytes of `/opt/governance/runtime/codex`.

`/opt/governance/runtime/codex` must be an executable regular file in a
read-only image layer, must not be a symlink, and is the only Codex executable
the evaluator may invoke. Values observed during the attempted run cannot
establish provenance.

The supervisor independently verifies the resolved image digest, executable
shape, version, binary hash, user, network mode, mounts, capabilities, and
resource controls. It computes containment, network, and proxy policy hashes
from the actual canonical configuration. Detailed observed fields remain in
the evidence schema; one composite `executionBoundaryId` is part of the
pairing identity. Baseline and governed arms must use the same value.

The composite identity hashes the observed image digest, exact Codex version
and binary hash, and canonical containment, network, and proxy policy hashes.
Because the proxy policy includes the exact model and deadline, changing the
model or timeout changes the boundary identity.

### Credential-free preflight receipt

The repository exposes a separate `workflow_dispatch` preflight workflow. It
has read-only repository permission, no GitHub Environment, and no secret
reference. It produces one closed receipt containing:

- `READY + NOT_EVALUATED`;
- runtime `codex`, exact model, and exact timeout;
- the reviewed image reference, Codex version, and executable hash;
- the observed image/runtime identity and the three policy hashes;
- the composite `executionBoundaryId`;
- all hardening flags, stopped PID namespace, empty cgroup, and complete
  cleanup.

The receipt is not image attestation, credential authorization, or paired-run
evidence. A human must review it, pin its boundary ID in a schema-v2 manifest,
rederive attempt and policy hashes, and commit the receipt, manifest, policy,
and synthetic scenario before the approval-gated real workflow is dispatched.
The evaluator requires those inputs to be tracked and clean.

The real run accepts the committed receipt path plus the same provenance and
timeout. It repeats preflight on the execution host and requires exact
receipt/manifest/observed agreement before reading `OPENAI_API_KEY`. The
workflow does not automate human review or commit.

### Evidence sequence

The required sequence is:

1. run credential-free preflight, prove its temporary boundary clean, and
   publish one closed non-claim receipt;
2. human-review and commit the receipt, schema-v2 manifest, policy, and
   synthetic scenario;
3. on the real host, revalidate every committed input, repeat preflight, and
   match exact provenance, model, timeout, and boundary identity;
4. only after that match, resolve the provider credential and run Codex inside
   the boundary;
5. observe the PID namespace stopped and the cgroup boundary empty;
6. run the pinned oracle and create an immutable snapshot while the isolated
   workspace still exists;
7. remove the container, relay, proxy, socket, temporary mounts, workspace, and
   managed-label resources, then prove cleanup;
8. score and atomically persist evidence.

Containment, proxy, oracle, privacy, cleanup, or persistence uncertainty
prevents candidate-artifact publication. A sanitized lifecycle journal may
exist only in OS temporary staging; failure removes it. Fatal stderr contains
only a stable code and non-sensitive fixed guidance.

### Status contract

Execution validity and the governance claim are separate:

| `executionStatus` | Meaning |
|---|---|
| `BLOCKED` | No attempt started because an operator, environment, image, credential, or safe-preflight prerequisite was missing. |
| `FAIL-CLOSED` | An attempt started but a containment, proxy, privacy, oracle, cleanup, persistence, or comparability control failed. No candidate artifact is published for that pair. |
| `PARTIAL` | At least one valid pair exists, but preregistered coverage or minimum-pair requirements are incomplete. |
| `PASS` | All requested pairs produced valid evidence. This does not mean the governance claim passed. |

| `claimDisposition` | Meaning |
|---|---|
| `NOT_EVALUATED` | No valid evidence was eligible for the claim gate. |
| `INSUFFICIENT` | Some valid evidence exists, but the preregistered claim gate lacks required coverage. |
| `NOT_SUPPORTED` | Valid complete evidence did not satisfy the claim threshold. |
| `SUPPORTED` | Valid complete evidence satisfied the preregistered claim threshold. |

Every non-`PASS` terminal result has a stable `phase`, `errorCode`,
`retryClass`, and non-sensitive remediation. Error codes have one canonical
owner shared by documentation, CLI output, schemas, and tests.

### Required tests before unlock

Unit and mock tests do not open this route. A Linux cgroup v2 Docker
integration suite must mechanically cover:

- normal completion;
- evaluator disconnect;
- supervisor `SIGKILL`;
- child timeout and non-zero exit;
- `setsid` and re-parented descendants;
- proxy death, bearer replay, quota, deadline, and body-shape violations;
- passwordless, narrowly reviewed `sudoers` execution of the exact
  `nsenter --net=/proc/<init-pid>/ns/net` relay command, plus relay readiness,
  bounded stdin configuration/lifeline, unexpected death, SSE streaming, byte
  limits, and cleanup;
- Docker API and cleanup failure;
- cgroup empty proof and the absence of candidate artifacts on every unsafe
  path;
- identical `executionBoundaryId` across both arms.

The approval-gated manual workflow may access an Environment credential only
after approval and must run both arms with the same reviewed image provenance,
model, timeout, and execution boundary. Missing registry access, image
provenance, committed receipt, credential, environment, Linux/cgroup-v2 host,
or reviewed `sudoers`/`nsenter` capability leaves Criterion 4 `BLOCKED`; it
never falls back to a weaker real mode. Once an attempt starts, relay,
containment, provider, or cleanup uncertainty is `FAIL-CLOSED`.

Live unlock evidence must come from the actual final reviewed commit and
include the credential-free preflight receipt, the human-reviewed commit,
`sudo -n`/`nsenter` availability without secret-bearing environment
preservation, real netns-to-host-UDS behavior, the approval-gated provider
attempt, normal and adversarial boundary teardown, and the resulting closed
paired evidence. Fixture images, injected Docker clients, mock upstreams, and
unit/integration PASS results are necessary but not sufficient.

## Decision Log

| Decision | Rationale | Rejected alternative |
|---|---|---|
| Use PID namespace plus cgroup v2 as the authority. | PID 1 teardown covers all namespace descendants and cgroup v2 exposes recursive population state. | Docker labels, process groups, or container state alone. |
| Preserve oracle before workspace cleanup. | The oracle must inspect the isolated live workspace and pinned inputs. | Deleting the workspace before oracle or snapshot. |
| Keep the upstream key in a host proxy. | The agent boundary gets no reusable provider credential or arbitrary egress. | Direct container egress or placing `OPENAI_API_KEY` in the container. |
| Enter only the container network namespace from a host relay. | Container loopback can reach a host-only UDS without mounting the socket into the container. | Bind-mounting the host UDS or attaching a Docker bridge. |
| Require a credential-free committed receipt before a real run. | Human review and exact boundary matching precede secret access. | Generating and consuming an unreviewed receipt in one credentialed job. |
| Force non-stored, foreground, client-tool-only Responses requests with bounded client replay. | Up to 32 sequential self-contained calls support a tool loop while rejecting provider-held state and hosted tools; each call remains byte-bounded with progressive SSE. | Provider defaults, background polling, response chaining, server-side tools, or unbounded replay. |
| Separate provenance inputs from observed runtime identity. | Runtime observation proves what ran; reviewed provenance supplies the expected trust input. | Trusting observed values or schema pins as attestation. |
| Pair on one composite execution-boundary identity. | Both arms remain comparable without exposing many independent cohort selectors. | Ignoring policy drift or treating each policy field as an unrelated cohort. |
| Separate execution validity from claim disposition. | A valid evaluator run can correctly conclude that the governance claim is not supported. | One overloaded PASS/FAIL status. |
| Treat approval as credential authorization only. | Human approval does not prove process, network, or cleanup containment. | Counting the approval gate as runtime evidence. |
| Fail closed on daemon or cleanup uncertainty. | Evidence cannot outlive an unproven execution boundary. | Best-effort cleanup followed by publication. |
| Keep the unlock Linux/Codex-only. | Other runtimes and platforms lack equivalent mechanically tested containment in this change. | Broad multi-runtime or multi-platform enablement. |

## Consequences

Real evaluation gains a mechanically testable path without weakening the
existing fail-closed default. The route adds a Linux/Docker operational
dependency, an externally maintained reviewed image, a host proxy, a
host-network-namespace relay, narrowly reviewed `sudoers`/`nsenter`, new schema
identity, a committed receipt, and two manual workflows. It also makes absence
of the external image, provenance, Environment, credential, or host capability
an explicit `BLOCKED` state rather than a reason to simulate success.

## Reopen Conditions

Reopen this ADR before changing the runtime image ABI, container or cgroup
authority, relay privilege boundary, provider endpoint, request-state/tool
policy, evidence identity, credential-access ordering, or platform/runtime
scope. Equivalent containment on macOS, Windows, Claude, or Antigravity
requires a separate decision and mechanical evidence.

## References

- [Linux PID namespaces](https://man7.org/linux/man-pages/man7/pid_namespaces.7.html)
- [Linux cgroup v2 populated state](https://www.kernel.org/doc/html/latest/admin-guide/cgroup-v2.html)
- [Docker none network driver](https://docs.docker.com/engine/network/drivers/none/)
- [GitHub deployment environments](https://docs.github.com/en/actions/concepts/workflows-and-actions/deployment-environments)
- [OpenAI data controls and endpoint defaults](https://platform.openai.com/docs/models/default-usage-policies-by-endpoint)
