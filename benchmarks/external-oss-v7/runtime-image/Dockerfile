ARG BASE_IMAGE
FROM ${BASE_IMAGE}

USER root
ARG INSTALL_LIBMAGIC=false
RUN set -eux; \
    if [ "$INSTALL_LIBMAGIC" = "true" ]; then \
      apt-get update; \
      apt-get install --yes --no-install-recommends libmagic1 libmagic-mgc; \
      rm -rf /var/lib/apt/lists/*; \
    fi

# Numeric identity is intentional: offline verification supplies the same
# non-root UID/GID explicitly and never runs this image as root.
USER 65532:65532
