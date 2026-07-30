# Experimental Governance Impact Containment

This directory is not part of the Core release unit. It is excluded from the
published package, from `npm run ci`, and from the Core validation workflow.

## Why it lives here

The original milestone brief keeps OCI runtime containment, the credential
proxy, and the live paired evaluator out of Core `main` so that neither can
block ordinary Core CLI releases.

## Contents

```text
eval.mjs           live paired evaluator: the run and preflight subcommands
lib/oci-supervisor.mjs    Linux Codex OCI supervisor
lib/oci-proxy-facade.mjs  host credential proxy facade for OCI attempts
lib/credential-proxy.mjs  host-only credential proxy
uds-relay.mjs      loopback relay attached inside the host network namespace
oci-integration.mjs       opt-in Docker integration harness
tests/             tests for everything in this directory
```

## Dependency direction

The dependency runs one way only: this directory may import Core modules under
`scripts/`, and Core never imports anything here. `tests/governance/core-release-boundary.test.mjs`
fails if a Core module imports this surface.

Core's `scripts/governance-impact-eval.mjs` keeps the offline controls, the
paired-scenario engine, and the `validate`, `replay`, `aggregate`, and `gate`
subcommands. It answers `run` and `preflight` with an exit 2
`EXPERIMENTAL_ENTRY_REQUIRED` usage error that names the entry here.

## Commands

```text
npm run ci:experimental                        check and test this directory
npm run test:governance-impact:oci:integration opt-in Docker harness
```

Running the live evaluator requires `GOVERNANCE_IMPACT_REAL=1` and the
approval-gated workflows in `.github/workflows/`.
