#!/usr/bin/env bash
set -euo pipefail

# Usage: RUNTIME_IMAGE=<digest-locked-image> ./minimal-noexec-reproducer.sh <output-dir>
# The caller must provide the exact V8-inherited runtime image. This script does
# not pull images or use a network fallback.

output_dir=${1:?output directory is required}
runtime_image=${RUNTIME_IMAGE:?RUNTIME_IMAGE must identify the exact digest-locked runtime image}
mkdir -p "$output_dir"
output_dir=$(cd "$output_dir" && pwd)

docker info >"$output_dir/docker-info.txt" 2>&1

run_case() {
  local case_name=$1
  local tmpfs_options=$2
  local expected=$3
  local container_id
  local output_file="$output_dir/${case_name}-output.txt"
  local rc

  container_id=$(docker create --name "v8-reproducer-${case_name}-$$" \
    --network none --read-only --cap-drop=ALL \
    --security-opt no-new-privileges:true --user 65532:65532 \
    --tmpfs "/workspace:${tmpfs_options}" \
    --mount "type=bind,src=$output_dir,dst=/out,rw" \
    --env "CASE_NAME=$case_name" \
    "$runtime_image" sh -ceu '
      cat /proc/self/mountinfo > "/out/${CASE_NAME}-mountinfo.txt"
      if command -v findmnt >/dev/null 2>&1; then
        findmnt -T /workspace -o TARGET,FSTYPE,OPTIONS > "/out/${CASE_NAME}-findmnt.txt"
      else
        : > "/out/${CASE_NAME}-findmnt.txt"
      fi
      printf "#!/bin/sh\nexit 0\n" > /workspace/probe
      chmod 0755 /workspace/probe
      test -x /workspace/probe
      echo TEST_X_PASS
      /workspace/probe
      echo EXECUTION_PASS
    ')

  set +e
  docker start -a "$container_id" >"$output_file" 2>&1
  rc=$?
  set -e

  docker rm -f "$container_id" >/dev/null 2>&1 || :

  if test "$case_name" = noexec; then
    grep -Fqx TEST_X_PASS "$output_file"
    if grep -Fqx EXECUTION_PASS "$output_file"; then exit 1; fi
    printf '%s\n' "$expected" >> "$output_file"
  else
    test "$rc" -eq 0
    grep -Fqx TEST_X_PASS "$output_file"
    grep -Fqx EXECUTION_PASS "$output_file"
  fi

  printf '{"case":"%s","expected":"%s","failureCode":"%s","exitCode":%s,"testXPass":%s,"executionPass":%s}\n' \
    "$case_name" "$expected" "$expected" "$rc" \
    "$(grep -Fqx TEST_X_PASS "$output_file" && echo true || echo false)" \
    "$(grep -Fqx EXECUTION_PASS "$output_file" && echo true || echo false)" \
    > "$output_dir/${case_name}-result.json"
}

run_case noexec 'rw,noexec,nosuid,nodev,size=32m,uid=65532,gid=65532,mode=0750' \
  WORKSPACE_MOUNT_NOEXEC_CONFIRMED
run_case exec 'rw,exec,nosuid,nodev,size=32m,uid=65532,gid=65532,mode=0750' \
  WORKSPACE_EXECUTION_CONFIRMED

printf '%s\n' '{"schemaVersion":1,"status":"PASS","noexecCase":"test -x PASS and execution FAIL","execCase":"execution PASS"}' \
  > "$output_dir/summary.json"
