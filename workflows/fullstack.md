# Fullstack SaaS Workflow

Applies when: `PROJECT_BRIEF.md` / `TECH_STACK.md` has already selected a fullstack SaaS or web app route. Only then use this checklist for projects built on Next.js, TypeScript, Tailwind, shadcn/ui, Supabase, the OpenAI API, Playwright, and Vercel previews.

## Documents To Add

- `DATA_MODEL.md`: tenant, user/staff, role, core tables, RLS, seed/mock data, data retention policy.
- `API_CONTRACT.md`: route/server action/webhook, request, response, error shape, permissions, idempotency.
- `ENV_CHECKLIST.md`: the env vars local, preview, and production need, where the secrets come from, what must not be committed, provider setup.

## Implementation Order

1. Start with a thin slice that can be verified locally: log in, create one record, reload and it is still there.
2. Then fill in the API / DB boundary: schema, RLS, migration, seed, mock adapter.
3. Then do UI states: loading, empty, error, disabled, permission denied.
4. Only then wire external providers: real OAuth, payments, email, real webhooks.

## Do Not Start With

- Do not build a full CRM, billing, multi-tenant admin, or production multi-channel integration first.
- Do not treat provider setup as a blocker for the local MVP.
- Do not change database security rules before the RLS / permission documents exist.

## Verification

- local smoke: start, log in, create a record, reload, query the DB.
- e2e smoke: Playwright over the core flow.
- preview smoke: Vercel preview plus a remote env check.
- performance smoke: the p95 target for core pages is written into SPEC.
