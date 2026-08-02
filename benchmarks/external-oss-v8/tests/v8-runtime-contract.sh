#!/usr/bin/env bash
set -u

task_id=${1:?task id is required}
fail() { echo "$1"; exit "${2:-41}"; }

case "$task_id" in
  TASK-OSS-01) required_path=packages/cli/node_modules ;;
  TASK-OSS-03) required_path=node_modules ;;
  TASK-OSS-09) required_path=.venv/bin/python ;;
  *) fail UNKNOWN_TASK 2 ;;
esac
test -e "/cache/$required_path" || fail DEPENDENCY_CACHE_INCOMPLETE 42

cp -R --no-preserve=ownership /seed/. /workspace/ 2>/dev/null || fail WORKSPACE_SEED_COPY_DENIED
while IFS= read -r relative_root; do
  test -n "$relative_root" || fail CACHE_ROOT_LIST_INVALID
  case "$relative_root" in /*|*../*) fail CACHE_ROOT_LIST_INVALID ;; esac
  test -e "/cache/$relative_root" || fail DEPENDENCY_CACHE_INCOMPLETE 42
  mkdir -p "/workspace/$relative_root" || fail WORKSPACE_CACHE_PATH_DENIED
  cp -R --no-preserve=ownership "/cache/$relative_root/." "/workspace/$relative_root/" || fail WORKSPACE_CACHE_COPY_DENIED
  chmod -R u+rwX "/workspace/$relative_root" || fail WORKSPACE_CACHE_PERMISSIONS
done < /harness/cache-roots.txt

test "$(id -u)" = 65532 || fail NON_ROOT_CONTRACT_FAILED
test "$(awk '/^CapEff:/{print $2}' /proc/self/status)" = 0000000000000000 || fail CAP_DROP_CONTRACT_FAILED
test "$(awk '/^NoNewPrivs:/{print $2}' /proc/self/status)" = 1 || fail NO_NEW_PRIVILEGES_CONTRACT_FAILED
if touch /cache/.v8-cache-write-test 2>/dev/null; then fail CACHE_WRITE_ALLOWED; fi

cat /proc/self/mountinfo > /workspace/mountinfo.txt || fail MOUNTINFO_CAPTURE_FAILED

mount_options() {
  local target=$1
  local output=$2
  findmnt -T "$target" -o TARGET,FSTYPE,OPTIONS > "$output" || fail MOUNT_FLAGS_UNAVAILABLE
  findmnt -T "$target" -no OPTIONS
}

has_mount_option() {
  local options=$1 token=$2
  case ",$options," in *",$token,"*) return 0 ;; *) return 1 ;; esac
}

require_mount_option() {
  has_mount_option "$1" "$2" || fail "$3"
}

require_mount_alias() {
  local options=$1 failure=$2
  shift 2
  for token in "$@"; do
    if has_mount_option "$options" "$token"; then return 0; fi
  done
  fail "$failure"
}

workspace_options=$(mount_options /workspace /workspace/workspace-mount.txt)
cache_options=$(mount_options /cache /workspace/cache-mount.txt)
home_options=$(mount_options /home/benchmark /workspace/home-mount.txt)
tmp_options=$(mount_options /tmp /workspace/tmp-mount.txt)
root_options=$(findmnt -T / -no OPTIONS) || fail ROOT_MOUNT_FLAGS_UNAVAILABLE

require_mount_option "$workspace_options" rw WORKSPACE_MOUNT_NOT_WRITABLE
if has_mount_option "$workspace_options" noexec; then fail WORKSPACE_MOUNT_NOEXEC; fi
require_mount_option "$workspace_options" nosuid WORKSPACE_MOUNT_NOSUID_MISSING
require_mount_option "$workspace_options" nodev WORKSPACE_MOUNT_NODEV_MISSING
require_mount_alias "$workspace_options" WORKSPACE_MOUNT_SIZE_MISSING size=8g size=8388608k
require_mount_option "$workspace_options" uid=65532 WORKSPACE_MOUNT_UID_MISSING
require_mount_option "$workspace_options" gid=65532 WORKSPACE_MOUNT_GID_MISSING
require_mount_alias "$workspace_options" WORKSPACE_MOUNT_MODE_MISSING mode=0750 mode=750
require_mount_option "$cache_options" ro CACHE_MOUNT_NOT_READONLY
require_mount_option "$home_options" rw HOME_MOUNT_NOT_WRITABLE
require_mount_option "$home_options" noexec HOME_MOUNT_EXECUTABLE
require_mount_option "$home_options" nosuid HOME_MOUNT_NOSUID_MISSING
require_mount_option "$home_options" nodev HOME_MOUNT_NODEV_MISSING
require_mount_alias "$home_options" HOME_MOUNT_SIZE_MISSING size=1g size=1048576k
require_mount_option "$home_options" uid=65532 HOME_MOUNT_UID_MISSING
require_mount_option "$home_options" gid=65532 HOME_MOUNT_GID_MISSING
require_mount_alias "$home_options" HOME_MOUNT_MODE_MISSING mode=0700 mode=700
require_mount_option "$tmp_options" rw TMP_MOUNT_NOT_WRITABLE
require_mount_option "$tmp_options" noexec TMP_MOUNT_EXECUTABLE
require_mount_option "$tmp_options" nosuid TMP_MOUNT_NOSUID_MISSING
require_mount_option "$tmp_options" nodev TMP_MOUNT_NODEV_MISSING
require_mount_alias "$tmp_options" TMP_MOUNT_SIZE_MISSING size=2g size=2097152k
require_mount_option "$tmp_options" uid=65532 TMP_MOUNT_UID_MISSING
require_mount_option "$tmp_options" gid=65532 TMP_MOUNT_GID_MISSING
require_mount_alias "$tmp_options" TMP_MOUNT_MODE_MISSING mode=1770
require_mount_option "$root_options" ro ROOT_FILESYSTEM_WRITABLE

cat > /workspace/workspace-exec-probe.sh <<'EOF'
#!/bin/sh
exit 0
EOF
chmod 0755 /workspace/workspace-exec-probe.sh || fail WORKSPACE_PROBE_MODE_DENIED
/workspace/workspace-exec-probe.sh || fail WORKSPACE_EXECUTION_DENIED

vitest_resolved_path=
vitest_version_probe_pass=false
case "$task_id" in
  TASK-OSS-01)
    cd /workspace/packages/cli 2>/dev/null || fail WORKING_DIRECTORY_DENIED
    test -e ./node_modules/.bin/vitest || fail RUNTIME_BINARY_EXECUTION_DENIED
    chmod u+x ./node_modules/.bin/vitest 2>/dev/null || fail RUNTIME_BINARY_EXECUTION_DENIED
    vitest_resolved_path=$(readlink -e ./node_modules/.bin/vitest 2>/dev/null || true)
    test -n "$vitest_resolved_path" || fail SYMLINK_TARGET_EXECUTION_DENIED
    printf '%s\n' "$vitest_resolved_path" > /workspace/vitest-resolved-path.txt
    readlink ./node_modules/.bin/vitest > /workspace/vitest-symlink.txt 2>/dev/null || fail SYMLINK_TARGET_EXECUTION_DENIED
    ./node_modules/.bin/vitest --version > /workspace/vitest-version.txt 2>&1 || fail RUNTIME_BINARY_EXECUTION_DENIED
    vitest_version_probe_pass=true
    ;;
  TASK-OSS-03)
    cat > /workspace/v8-runner-probe.test.js <<'EOF'
import test from 'node:test';
test('workspace executable runner probe', () => {});
EOF
    node --test --test-reporter=spec /workspace/v8-runner-probe.test.js > /workspace/runner-probe.txt 2>&1 || fail RUNTIME_BINARY_EXECUTION_DENIED
    ;;
  TASK-OSS-09)
    /workspace/.venv/bin/python --version > /workspace/python-version.txt 2>&1 || fail RUNTIME_BINARY_EXECUTION_DENIED
    /workspace/.venv/bin/python -m pytest --version > /workspace/pytest-version.txt 2>&1 || fail RUNTIME_BINARY_EXECUTION_DENIED
    library=$(find /usr/lib /lib -name 'libmagic.so*' -print -quit 2>/dev/null || true)
    database=$(find /usr/share /usr/local/share -name 'magic.mgc' -print -quit 2>/dev/null || true)
    test -n "$library" || fail LIBMAGIC_LIBRARY_MISSING
    test -n "$database" || fail LIBMAGIC_DATABASE_MISSING
    printf '%s\n' "$library" > /workspace/libmagic-library-path.txt
    printf '%s\n' "$database" > /workspace/libmagic-database-path.txt
    /workspace/.venv/bin/python -c 'import magic; assert magic.from_buffer(b"hello")' > /workspace/libmagic-probe.txt 2>&1 || fail RUNTIME_BINARY_EXECUTION_DENIED
    ;;
esac

printf '{"schemaVersion":1,"benchmarkId":"GS-OSS-2026-08-02-V8","evidenceClass":"external-observational","taskId":"%s","status":"PASS","workspaceExecObserved":true,"workspaceMountExec":true,"workspaceMountNoexec":false,"runtimeBinaryExecutionPass":true,"measuredNetworkUsed":false,"cacheReadOnlyObserved":true,"readonlyRootObserved":true,"nonRootObserved":true,"vitestResolvedPath":"%s","vitestVersionProbePass":%s}\n' \
  "$task_id" "$vitest_resolved_path" "$vitest_version_probe_pass" > /workspace/workspace-exec-receipt.json
echo PASS
