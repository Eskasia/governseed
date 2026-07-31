# CONTEXT.md

## Shared Language

- governance bootstrap generator: a small tool that creates project governance documents before implementation.
- base profile: the minimal profile containing only required governance documents.
- doctor JSON: machine-readable verification output from `scripts/doctor.mjs --json`.

## Roles

- maintainer: verifies the starter repo.
- agent: reads the generated documents before implementation.
- reviewer: checks fixture drift.

## Important Objects

- Profile: the JSON manifest under `profiles/`.
- Required document: a document that must exist and be filled for the profile.
- Conditional document: a document suggested only when the project surface needs it.

## Ambiguities

- This fixture is an adoption proof, not a product example.
