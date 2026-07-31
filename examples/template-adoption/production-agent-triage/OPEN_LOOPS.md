# OPEN_LOOPS.md

## 未決事項

| Status | Loop ID | Basis | Question / Risk | Impact | Owner | Next Step | Due | Resolution source |
|---|---|---|---|---|---|---|---|---|
| open | LOOP-401 | not-stated | Should an unanswered approval escalate to a second approver or expire? | high | operator-role | Run one drill with a deliberately unanswered approval and record what responders expect. | before first live shift | n/a |
| open | LOOP-402 | not-stated | How stale may the incident history index be before citations mislead? | high | release-owner-role | Measure citation resolution against a deliberately aged synthetic index. | before widening the action boundary | n/a |
| closed | LOOP-403 | not-stated | May draft evidence retain raw alert payloads? | high | security-reviewer-role | Retain normalized closed-schema fields only; raw payloads never leave the alert source. | resolved | SRC-402 |

## Rules

- An approval that expires is not an approval; expiry must be recorded as a decline.
- Close an item only after the decision is written into `AGENT_RUNTIME.md` or `AI_SECURITY_REVIEW.md`.
- Re-check this file before any change that widens the agent's action boundary.
