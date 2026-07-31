# ENV_CHECKLIST.md

## Environment Variables

| Variable | Purpose | Local | Preview | Production | Sensitivity | Source / how to obtain |
|---|---|---|---|---|---|---|
|  |  |  |  |  | public / secret |  |

## Sensitivity Rules

- **public**: may appear in the frontend bundle (`NEXT_PUBLIC_*`, `VITE_*`)
- **secret**: server-side only, never committed to git, never printed to a console log

## Do Not Commit

- [ ] `.env` / `.env.local` / `.env.production` are in `.gitignore`
- [ ] No API key appears in source, commit history, or CI logs

## Provider Setup

| Provider | Setup steps | Dashboard URL | Notes |
|---|---|---|---|
|  |  |  |  |

## Pre-deploy Check

- [ ] Local smoke: every required env var is set and `npm run dev` starts
- [ ] Preview: env vars are set in the Vercel / Netlify / CI preview environment
- [ ] Production: env vars are set and the rotation policy is recorded
- [ ] No env var silently falls back to a default without being recorded
