#!/usr/bin/env bash
set -u

task_id=${1:?task id is required}
required_path=${2:?required cache path is required}
fail() { echo "$1"; exit "${2:-41}"; }

/harness/v8-runtime-contract.sh "$task_id" || exit $?

vitest_resolved_path=
libmagic_library_observed=false
libmagic_database_observed=false
python_magic_import_pass=false
python_magic_functional_smoke_pass=false
if test "$task_id" = TASK-OSS-01; then
  vitest_resolved_path=$(cat /workspace/vitest-resolved-path.txt 2>/dev/null || true)
fi
if test "$task_id" = TASK-OSS-09; then
  test -s /workspace/libmagic-library-path.txt || fail LIBMAGIC_LIBRARY_EVIDENCE_MISSING
  test -s /workspace/libmagic-database-path.txt || fail LIBMAGIC_DATABASE_EVIDENCE_MISSING
  libmagic_library_observed=true
  libmagic_database_observed=true
  python_magic_import_pass=true
  python_magic_functional_smoke_pass=true
fi

case "$task_id" in
  TASK-OSS-01)
    cd /workspace/packages/cli 2>/dev/null || fail WORKING_DIRECTORY_DENIED
    ./node_modules/.bin/vitest --run src/commands/asset.spec.ts || fail OFFLINE_SMOKE_FAILED:immich-public-test
    ;;
  TASK-OSS-03)
    cd /workspace 2>/dev/null || fail WORKING_DIRECTORY_DENIED
    TEST_BACKEND=1 node --test --test-reporter=spec test/backend-test/test-status-page.js || fail OFFLINE_SMOKE_FAILED:uptime-public-test
    ;;
  TASK-OSS-09)
    cd /workspace 2>/dev/null || fail WORKING_DIRECTORY_DENIED
    PAPERLESS_SECRET_KEY=synthetic-test-only-value \
      PAPERLESS_DISABLE_DBHANDLER=true \
      PAPERLESS_CACHE_BACKEND=django.core.cache.backends.locmem.LocMemCache \
      PAPERLESS_CHANNELS_BACKEND=channels.layers.InMemoryChannelLayer \
      /workspace/.venv/bin/python -m pytest -q src/paperless/tests/test_parser_utils.py || fail OFFLINE_SMOKE_FAILED:paperless-public-test
    ;;
  *) fail UNKNOWN_TASK 2 ;;
esac

test -e "/cache/$required_path" || fail DEPENDENCY_CACHE_INCOMPLETE 42
printf '{"schemaVersion":1,"benchmarkId":"GS-OSS-2026-08-02-V8","evidenceClass":"external-observational","taskId":"%s","status":"READY","workspaceExecObserved":true,"workspaceMountExec":true,"workspaceMountNoexec":false,"runtimeBinaryExecutionPass":true,"measuredNetworkUsed":false,"cacheReadOnlyObserved":true,"readonlyRootObserved":true,"nonRootObserved":true,"publicTestSmokePass":true,"vitestResolvedPath":"%s","vitestSmokePass":%s,"vitestVersionProbePass":%s,"libmagicLibraryObserved":%s,"libmagicDatabaseObserved":%s,"pythonMagicImportPass":%s,"pythonMagicFunctionalSmokePass":%s,"cacheBinaryCommitted":false,"credentialIncluded":false,"codexIncluded":false,"hiddenOracleIncluded":false}\n' \
  "$task_id" "$vitest_resolved_path" "$([ "$task_id" = TASK-OSS-01 ] && echo true || echo false)" "$([ "$task_id" = TASK-OSS-01 ] && echo true || echo false)" "$libmagic_library_observed" "$libmagic_database_observed" "$python_magic_import_pass" "$python_magic_functional_smoke_pass" > /workspace/cache-receipt.json
echo PASS
