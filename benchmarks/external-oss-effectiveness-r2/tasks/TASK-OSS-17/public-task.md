# TASK-OSS-17

Streaming text decoding must not emit a synthetic empty string when the decoder flushes empty content. Preserve all real decoded chunks and their order.
