# PROJECT_BRIEF.md

## One-line summary

Help a small consulting team turn client documents into a traceable question-and-answer workspace.

## Users

- Consulting team owner
- Consulting team members

## Problem

Client documents are scattered across folders and email, so the team cannot quickly confirm where an answer came from.

## MVP

- Upload a document.
- Ask questions about the document.
- Answers must show a citation.

## Privacy-safe source attestations

| Source ID | Source class | Trace mode | Source ref | Content retained | Attestation | Confirmed by | Confirmed at |
|---|---|---|---|---|---|---|---|
| SRC-101 | synthetic | attestation-only | n/a | no | confirmed | product-owner-role | 2026-07-13 |
| SRC-102 | synthetic | attestation-only | n/a | no | confirmed | security-reviewer-role | 2026-07-13 |

## Product shape decision

- Decision mode: ai-recommended route
- Product shape: fullstack AI web app
- Q1-Q9 basis: the consulting owner needs to click through the core flow themselves — upload a document, log in, ask a question, and see a citation; the data, permission, RAG, eval, and security documents all affect acceptance.
- Why not website / app / mini program / backend-only / admin system or another shape: a landing page cannot verify the Q&A workspace; a native app or mini program adds platform review and device boundaries; an API-only service does not let the owner accept the work directly; an admin system is not the core of the first release.
- Re-evaluate when: the core user becomes an external system, offline mobile review is needed, or preview acceptance becomes API-only.
- Decision status: active
- Evidence: SRC-101, SRC-102, REQ-101@1, REQ-102@1
- Nearest alternative: API-only RAG service
- Review trigger: event-only when direct browser acceptance changes to system-to-system integration or offline review

## Explicitly out of scope

- No multilingual translation.
- No production billing.
- No cross-client document sharing.

## Acceptance owner

- The team owner clicks through the core flow themselves.

## Done criteria

- A new agent understands the direction within 30 seconds.
- Problem, users, and MVP are not collapsed into one sentence.
