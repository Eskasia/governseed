# TASK-OSS-11

When a typed JSONL streaming endpoint is registered on an `APIRouter` and then included in a `FastAPI` application, its generated OpenAPI response must preserve the stream item schema. Keep the runtime behavior and non-stream response handling unchanged.
