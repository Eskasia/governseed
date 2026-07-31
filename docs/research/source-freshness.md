# Source Freshness Verification

**Date:** 2026-07-31 (Asia/Taipei)

Every classification in the capability matrices rests on what an official
documentation page said on a fixed date. The upstream tools ship weekly, so the
sentence a row depends on can disappear without anything in this repository
noticing — "every row has an official source" would silently decay into "every
row had an official source in July". This mechanism gives each cited page a
pinned load-bearing sentence and re-checks that the sentence is still there.

## What Is Pinned

`source-freshness.lock.json` (in this directory; repository-only, not shipped
in the npm package) holds one entry per official page cited by the three
capability matrices:

- `url` — the cited page.
- `matrices` — which matrix files cite it. Every listed matrix must actually
  cite the URL; the offline test fails otherwise.
- `excerpt` — the load-bearing sentence: the official wording the citing rows'
  classifications rest on, verified verbatim against the fetched page at seed
  time.
- `status` — `VERIFIED` (excerpt confirmed on the live page at seed time) or
  `UNVERIFIABLE` (page content could not be fetched as text at seed time;
  `note` records why). An `UNVERIFIABLE` entry never participates in
  fresh-or-drifted verdicts — the BLOCKED discipline extended to sources:
  annotate honestly rather than guess.

The excerpt is an existence check, not a snapshot diff. If the sentence is
still on the page, the basis for the classification still exists; if the whole
page changed around it, the matrix date already says the row is a dated claim.

## The Two Halves

**Offline (runs in `test:governance`, so in `npm run ci`):** parse the three
matrices, extract every cited page — full URLs in prose, and page slugs
resolved against the single declared base URL — and compare bidirectionally
with the lock. A citation without a lock entry fails; a lock entry no matrix
cites fails. No network is involved.

**Online (`npm run verify:sources`, never part of `check`/`validate`/`ci`):**
fetch each `VERIFIED` entry's page and report per source:

| Status | Meaning | Fails `--strict`? |
|---|---|---|
| `FRESH` | The pinned sentence is still on the page | No |
| `DRIFTED` | The page loads but the sentence is gone | Yes |
| `UNREACHABLE` | Fetch failed (network, 4xx, 5xx) | No — a blip is not drift |
| `UNVERIFIABLE` | Pinned as unverifiable at seed time | No |

Coverage gaps also fail `--strict`. `--json` emits the full report as JSON.
The weekly `source-freshness` GitHub Actions workflow runs the strict mode and
can be triggered manually via `workflow_dispatch`.

## When A Source Drifts

`DRIFTED` means the official wording a classification rests on is no longer
present. The response is human re-verification, never automation:

1. Read the current page and find what replaced the sentence.
2. Re-verify every matrix row whose `Source` cites that page. If the behavior
   changed, the matrix needs a reviewed update — the frozen matrices are
   evidence documents, and this tool never edits them.
3. Re-seed the lock entry with the new load-bearing sentence and update
   `verifiedAt`.

## Re-seeding

There is no seed command by design: seeding is a human act of choosing which
official sentence a classification rests on. Edit the lock entry, then run
`npm run verify:sources` — the entry must come back `FRESH` against the live
page, and `test:governance` enforces coverage and well-formedness offline.
