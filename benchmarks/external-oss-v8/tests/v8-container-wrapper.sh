#!/bin/sh
set -u

script=${1:?container script is required}
shift
/harness/"$script" "$@"
rc=$?
if [ "$rc" -ne 0 ]; then
  exit "$rc"
fi

echo V8_CONTAINER_READY
while [ ! -e /workspace/.v8-release ]; do
  sleep 1
done
rm -f /workspace/.v8-release
exit 0
