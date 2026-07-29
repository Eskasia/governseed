ARG BASE_IMAGE
FROM ${BASE_IMAGE}

ARG BASE_IMAGE
LABEL org.openai.governance-impact.fixture="true"
LABEL org.openai.governance-impact.fixture.base="${BASE_IMAGE}"

ENV PATH="/opt/governance/runtime:/usr/bin:/bin"
ENV LANG="C.UTF-8"

COPY --chown=65532:65532 --chmod=0555 codex /opt/governance/runtime/codex

USER 65532:65532
