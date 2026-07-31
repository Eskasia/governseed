# CONTEXT.md

## Shared Language

- runtime adapter: the per-runtime instruction files a generated project carries, here `.agents/`.
- skill: an Antigravity instruction file routed by its frontmatter name.
- generated output: bytes produced by `scripts/init.mjs`, as opposed to bytes written by hand.

## Roles

- maintainer: verifies the starter repo and this fixture together.
- managed agent: reads `.agents/AGENTS.md` and the skills it lists.
- reviewer: checks that adapter changes and fixture changes land in the same commit.

## Important Objects

- `.agents/AGENTS.md`: the runtime entry point; it points at the canonical rules rather than restating them.
- `.agents/skills/<name>/SKILL.md`: one skill, routed by the `name` in its frontmatter.
- Expected doctor JSON: the checked-in verification output under `expected/`.

## Ambiguities

- This fixture is an adoption proof of generated files, not evidence of runtime behavior.
