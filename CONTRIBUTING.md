# Contributing

## How to Contribute

1. Fork the repository.
2. Create a feature branch: `git checkout -b feat/your-feature`.
3. Make focused changes following the conventions below.
4. Run validation: `node scripts/validate-starter.mjs .`.
5. Submit a pull request with the validation output.

## Adding a Workflow Doc

- Place the file in `workflows/` with a descriptive kebab-case name.
- Add a row to the routing table in `workflows/tool-routing.md`.
- Add a reference in `README.md` under the workflow map.
- If the workflow introduces a new project output document, add or update the template and validation allowlist.

## Adding a Template

- Place the file in `templates/` with an UPPER_SNAKE_CASE `.md` name.
- Add the template to `templates/README.md`.
- Reference it in `startup/02-required-project-docs.md` under fixed or conditional documents.
- Add it to the relevant `scripts/init.mjs` profile if it should be copied automatically.
- Ensure the template has meaningful structure: tables, field labels, and completion criteria, not just empty placeholders.

## Adding a Runtime Entrypoint

- Add the root instruction file if it is part of maintaining this starter.
- Add the generated-project version in `scripts/init.mjs`.
- Add a direct prompt under `prompts/` if users should be able to paste it into the runtime.
- Update `README.md`, `docs/index.md`, `VALIDATION.md`, and `scripts/validate-starter.mjs`.
- Run `npm run runtime:proof` when changing runtime adapters, runtime templates, profiles, or first-response expectations.

## Adding an Example Fixture

- Create a subdirectory under `examples/template-adoption/`.
- Include all 7 fixed documents with realistic filled content.
- Include the conditional documents required by that project type.
- Ensure `node scripts/doctor.mjs --strict <fixture>` passes.
- Add a note in `examples/template-adoption/README.md`.

## Adding Governance-Impact Evidence

- Use only synthetic/public scenario facts; real `run` accepts clean committed synthetic scenarios only.
- Keep the canonical task and fact set identical between baseline and governed arms. The governed overlay must not add requirements.
- Keep oracle code outside both agent-writable workspaces and declare every deterministic `CHECK-*` ID.
- Preregister all four artifact hashes, the cohort, repetition IDs, seeds, attempt IDs, manifest hash, and bootstrap seed before real execution.
- Never persist private prompts, raw model stdout/stderr, tool traces, environment variables, credentials, absolute home paths, or raw diff hunks.
- Treat privacy, containment, output-schema, process-tree, and cleanup uncertainty as fail-closed infrastructure errors with no artifact.
- Do not treat original POSIX process-group absence as proof that no detached or re-parented descendant survived.
- Keep public CI offline. Do not add `GOVERNANCE_IMPACT_REAL` to `npm run ci` or a public workflow.
- Commit every new or changed required evaluator, scenario, privacy-test, workflow, and audit artifact before release validation; staging alone and working-tree drift do not satisfy the `HEAD` evidence gate.
- Run:

  ```bash
  npm run test:governance-impact
  npm run validate:governance-impact
  npm run eval:governance
  git diff --check
  ```

- Update `docs/governance-impact-eval.md` and public claim wording when the CLI, adapter matrix, schema, privacy boundary, or gate policy changes.
- Do not report an “improves” result unless the exact preregistered paired evidence passes `gate`; otherwise report only cohort-specific observed deltas.

## Style Conventions

- Markdown files use ATX headings (`#`, `##`, `###`).
- Tables use pipe syntax with header separator rows.
- Cross-references use backtick-wrapped filenames.
- Public-facing docs avoid hardcoded local absolute paths.
- Do not claim external adoption without evidence.
- Keep runtime-proof claims separate from governance-impact evaluator claims.
- Offline controls, generated fixtures, and mock runtime proof are not effectiveness evidence.
- Do not add root numbered workflow files.
- Do not add a root `codex_mvp_prd_pack.md`; put PRD/MVP content in templates or workflow docs.
