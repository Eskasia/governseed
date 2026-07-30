# Retired Branches

Recorded: 2026-07-30 (Asia/Taipei)

Branch work that was never merged and is not planned for merge as it stands. The
record exists so the ideas stay findable without keeping a stale branch in the
active workflow. Every entry is a historical pointer, not an accepted proposal.

## `codex/github-skills-routing`

Status: **unconfirmed**

Antigravity `implementation-plan` and `release-handoff` skills plus
`workflows/skill-and-plugin-adoption.md` were developed on this branch and never
merged into `main`. The ideas are preserved on the branch; adopting any of them
requires rewriting against the current tree.

| Field | Value |
|---|---|
| Published tip | `2861c60` (2026-06-02) `Harden public release governance flow` |
| Local-only follow-up | `8d2a09b` (2026-06-03) `Add lifecycle skill routing and registry boundaries` |
| Merge base with `origin/main` | `21b7874` (2026-06-02) `chore: add public promotion readiness checks` |
| Distance | `origin/main` is 46 commits ahead of the merge base |
| Merged into `main` | No. Neither `2861c60` nor `8d2a09b` is an ancestor of `origin/main` |

Files that exist only on the branch:

```text
templates/runtime/antigravity/skills/implementation-plan/SKILL.md
templates/runtime/antigravity/skills/release-handoff/SKILL.md
workflows/skill-and-plugin-adoption.md
```

The branch predates the GovernSeed brand rename (`d7ed355`, PR #10, 2026-07-29)
and the decision-role and policy-compiler work merged in PR #9 and PR #11, so
its paths, brand strings, and validator expectations no longer match the current
tree.

Do not rebase this branch. If any part is adopted, rewrite it against the
current tree as new work and record the decision at that time.
