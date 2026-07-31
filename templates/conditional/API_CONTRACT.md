# API_CONTRACT.md

## Overview

- API style: REST / GraphQL / tRPC / Server Actions
- base URL:
- Versioning policy:
- auth method:

## Routes / Actions

| Method | Path / Action | Purpose | Auth | Request Body | Response | Error Shape | Idempotent | Notes |
|---|---|---|---|---|---|---|---|---|
|  |  |  |  |  |  |  |  |  |

## Error Shape

```json
{
  "error": {
    "code": "string",
    "message": "string",
    "details": {}
  }
}
```

## Webhook

| Event | Payload | Verification | Retry | Notes |
|---|---|---|---|---|
|  |  |  |  |  |

## Rate Limiting

- Limiting method:
- Quota:
- Over-limit response:

## Pagination

- Method: cursor / offset
- Default page size:
- Max page size:

## Permission Matrix

| Route / Action | anonymous | user | admin | service | Notes |
|---|---|---|---|---|---|
|  |  |  |  |  |  |

## External API Dependencies

| Provider | Purpose | Auth | Rate Limit | Fallback | Notes |
|---|---|---|---|---|---|
|  |  |  |  |  |  |
