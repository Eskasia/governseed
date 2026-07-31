# CONTEXT.md

## Shared language

| Term | Meaning | Do not confuse with |
|---|---|---|
| Workspace | The data boundary of one consulting team | A user account |
| Document | A source file that went through ingestion | The answer text |
| Citation | The source location an answer cites | An ordinary reference link |

## Roles

| Role | Goal | Permission / boundary |
|---|---|---|
| Owner | Administers the workspace | May invite members |
| Member | Uploads and queries documents | Sees only this workspace |

## Data objects

| Object | Meaning | Source of truth |
|---|---|---|
| Workspace | tenant boundary | database |
| Chunk | retrievable unit | vector store + database |

## Existing constraints

- Tenant permission filter must happen before retrieval.

## Decisions already made

- First preview uses demo credentials and seed data.
