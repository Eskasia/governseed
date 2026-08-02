#!/usr/bin/env bash
set -euo pipefail

# This is a disposable, public-network reproducer for the V6 image defect. It
# is never used by the measured offline job. It installs only the Python
# binding in a throwaway container; the system library is intentionally absent
# from the V6 base image.
image="${1:-python@sha256:f70215e5dbe2a47dee6d23f9c6d358bf3c148f59cce2fd165b61118e9d80f2bb}"
if ! docker info >/dev/null 2>&1; then
  echo 'EXPECTED_NOT_RUN: LOCAL_DOCKER_DAEMON_UNAVAILABLE'
  exit 77
fi

docker run --rm --network bridge --read-only \
  --tmpfs /tmp:rw,noexec,nosuid,nodev \
  "$image" sh -ceu '
    python -m pip install --no-cache-dir python-magic
    python -c "import importlib.util; assert importlib.util.find_spec(\"magic\")"
    if ldconfig -p 2>/dev/null | grep -q libmagic; then
      echo LIBMAGIC_LIBRARY_UNEXPECTEDLY_PRESENT >&2
      exit 31
    fi
    if find /usr/lib /lib -name "libmagic.so*" -print -quit | grep -q .; then
      echo LIBMAGIC_LIBRARY_UNEXPECTEDLY_PRESENT >&2
      exit 32
    fi
    python -c "import magic; magic.from_buffer(b\"hello\")"
  '
