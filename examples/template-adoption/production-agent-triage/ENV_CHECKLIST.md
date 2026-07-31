# ENV_CHECKLIST.md

## Environment Variables

| Variable | Purpose | Local | Preview | Production | Sensitivity | Source / how to obtain |
|---|---|---|---|---|---|---|
| `MODEL_API_KEY` | Call the model provider to generate drafts | Test key | Test key | Production key | secret | Created in the provider console, stored in the platform secret store |
| `ALERT_STREAM_TOKEN` | Read the alert stream | Synthetic stream | Synthetic stream | Production stream | secret | Alert platform service account |
| `APPROVAL_SERVICE_URL` | Approval service endpoint | Local mock service | Preview environment endpoint | Production endpoint | public | Platform service directory |
| `HISTORY_INDEX_URL` | Historical incident index endpoint | Local synthetic index | Preview synthetic index | Production index | public | Platform service directory |
| `AGENT_KILL_SWITCH` | Disable draft generation | Defaults to off | Defaults to off | Defaults to off | public | Platform feature flag |

## Sensitivity Rules

- **public**: may appear in the frontend bundle (`NEXT_PUBLIC_*`, `VITE_*`)
- **secret**: server-side only, never committed to git, never printed to a console log

## Do Not Commit

- [x] `.env` / `.env.local` / `.env.production` are in `.gitignore`
- [x] No API key appears in source, commit history, or CI logs

## Provider Setup

| Provider | Setup steps | Dashboard URL | Notes |
|---|---|---|---|
| Model provider | Create a dedicated key, scope it to draft generation, record the rotation date | Recorded in the internal service directory | Key rotation must update the secret store at the same time |
| Alert platform | Create a read-only service account, scope it to the alert stream | Recorded in the internal service directory | The service account must not be able to acknowledge or close alerts |
| Approval service | Register the agent as a requester, enable audit logging | Recorded in the internal service directory | The audit log is the evidence source for AC-402 |

## Pre-deploy Check

- [x] Local smoke: every required env var is set and `npm run dev` starts
- [x] Preview: env vars are set in the Vercel / Netlify / CI preview environment
- [x] Production: env vars are set and the rotation policy is recorded
- [x] No env var silently falls back to a default without being recorded
