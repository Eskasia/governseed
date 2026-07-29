# Runtime Proof

Runtime proof checks that generated runtime entrypoints have a minimal first-response contract for Codex, Claude Code, and Antigravity.

This is an entrypoint-contract smoke test, not a live model benchmark or evidence that governance improves delivery. It does not require API keys by default.

## Modes

| Mode | Command | Behavior |
|---|---|---|
| Default proof | `npm run runtime:proof` | Uses mock mode unless the caller explicitly sets `RUNTIME_PROOF_REAL=1`; never use this environment-sensitive entrypoint in public CI. |
| Forced mock proof | `npm run runtime:proof:mock` | Overrides an inherited real-mode opt-in; this is the public CI entrypoint. |
| Real proof | `RUNTIME_PROOF_REAL=1 npm run runtime:proof` | Explicit synthetic-only opt-in. Uses generated synthetic fixtures and fails closed when the runtime or required safety capability is unavailable. |

## Environment Variables

| Variable | Purpose |
|---|---|
| `CODEX_BIN` | Optional single Codex executable token. Defaults to `codex` in real mode. |
| `CLAUDE_BIN` | Optional single Claude Code executable token. Defaults to `claude` in real mode. |
| `ANTIGRAVITY_BIN` | Optional single Antigravity executable token. Defaults to `antigravity` in real mode. |
| `RUNTIME_PROOF_REAL` | Set to `1` to use real CLIs. Any other value uses mock output. |

Windows resolution accepts only native `.exe` or `.com` files. `.cmd` and `.bat` shims are rejected because runtime launch keeps `shell: false`; the proof never opens a command shell to make a shim executable.

## Proof Contracts

| Runtime | Fixture | Output | Required signal |
|---|---|---|---|
| Codex | `.tmp/runtime-codex` | validated normalized `codex-first-response.txt` | `FILES_READ`, `FIXED_DOCS`, `CONDITIONAL_DOCS`, `BLOCKERS`, `START_HERE.md`, `AGENTS.md` |
| Claude Code | `.tmp/runtime-claude` | validated normalized `claude-first-response.json` | `files_read`, `fixed_docs_present`, `conditional_docs_likely_needed`, `blockers` |
| Antigravity | `.tmp/runtime-antigravity` | validated normalized `antigravity-first-response.txt` | `SKILL_USED: intake-audit`, `FILES_READ`, `BLOCKERS`, `NEXT_INTAKE_QUESTION` |

## Evidence Safety

- Traces record the approved prompt-template version and privacy-safe metadata only. They never retain private prompt text or masked private excerpts.
- Raw model stdout/stderr, raw tool traces, environment variables, credentials, absolute home paths, and raw diff hunks are never persisted.
- Output is bounded, privacy-scanned, and parsed into an exact closed contract before it can become a normalized artifact.
- Raw temporary response data is removed in `finally`. Child reaping and cleanup must be proven before persistence.
- Scanner, output-schema, session-safety, or cleanup uncertainty fails closed with a stable code and no artifact; real mode never silently degrades to mock.

## Claim Boundary

Runtime proof establishes only the first-response contract above. The separate governance-impact evaluator measures delivery artifacts after intake is complete; it does not measure Q1-Q9 interview quality, and only gated real paired runs may support an effectiveness claim.

The governance-impact evaluator currently refuses Codex with `SESSION_SAFETY_UNAVAILABLE` because detached or re-parented descendant containment is not proven. It refuses Claude because workspace containment is unproven; Antigravity returns `RUNTIME_MISSING` when its executable is absent and otherwise remains refused with `SESSION_SAFETY_UNAVAILABLE` until non-persistence and containment are proven. These evaluator states do not change the runtime-proof mock contracts.

## Public CI Boundary

Public CI must be runnable without secrets and must not set the real-mode opt-in. The manual runtime proof workflow runs mock proof by default. Real proof is an explicit synthetic-only maintainer action and still refuses any runtime whose safety contract cannot be proven.

## Commands

```bash
npm run validate:runtime-proof
npm run runtime:proof
npm run runtime:proof:mock
RUNTIME_PROOF_REAL=1 npm run runtime:proof
```
