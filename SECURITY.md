# Security Policy

## Scope

This repository is a starter kit for project governance documents, scripts, and agent workflow routing. It does not ship a production application or hosted service.

## Do Not Commit

- API keys, tokens, cookies, private keys, or `.env` files.
- Raw tester identifiers, personal media, face crops, embeddings, or private customer data.
- Production deployment credentials or CI secrets.
- Private prompt text, masked private excerpts, or private source content.
- Raw model stdout/stderr, raw tool traces, environment variables, absolute home paths, or raw diff hunks.
- Logs or evidence artifacts that contain credentials or any prohibited value above.

## Governance Evidence Safety Boundary

- Real execution is synthetic-only. Governance-impact evaluation accepts only clean, committed synthetic scenarios; runtime proof accepts only generated synthetic fixtures. Private, customer, tenant, and production content are prohibited.
- Trace provenance records an approved prompt-template version and privacy-safe metadata, never a runtime prompt body.
- Child output may exist only as bounded in-memory buffers long enough to privacy-scan and parse it. The harness never serializes its minimal environment.
- Only validator-approved, privacy-scanned, normalized closed-schema evidence may persist, and only after child reaping and temporary-state cleanup are proven.
- Privacy-scanner unavailability, output-schema failure, session-persistence uncertainty, or cleanup uncertainty fails closed with a stable code and no artifact. The harness never falls back to a mock or weaker mode.
- Runtime proof is an entrypoint first-response contract smoke test. Governance-impact evaluation is a separate delivery-artifact evidence surface and requires its own claim gate.
- Governance-impact real execution currently refuses Codex with `SESSION_SAFETY_UNAVAILABLE` because detached or re-parented descendant containment is not proven. Claude remains refused while workspace containment is unproven; Antigravity is unavailable when its executable is missing and otherwise remains refused until non-persistence and containment are proven.

## Reporting

If you find a security issue in the starter scripts, templates, examples, or generated default behavior, open a private security advisory if the repository host supports it. Otherwise, contact the maintainer privately before opening a public issue.

## Expected Review Areas

- `scripts/init.mjs` must not overwrite existing project files without leaving them intact.
- `scripts/doctor.mjs` must not read secrets or print private values.
- Templates should teach projects to record secret names and ownership, not secret values.
- Examples must use placeholder data only.
- Runtime-proof and governance-impact paths must scan before persistence, remove raw temporary data in `finally`, and leave no artifact when cleanup cannot be proven.

## Not Covered

Security review for downstream projects generated from this starter remains the responsibility of each downstream project.
