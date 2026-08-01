#!/usr/bin/env bash
set -euo pipefail

output_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
result_path="$output_dir/reproducer-result.json"
work_root=$(mktemp -d "${TMPDIR:-/tmp}/governseed-v6-permission.XXXXXX")
trap 'chmod -R u+rwX "$work_root" 2>/dev/null || true; rm -rf "$work_root"' EXIT

uid_value=$(id -u)
gid_value=$(id -g)
groups_value=$(id -G | tr ' ' ',')
cwd_value=$(pwd -P)
shell_value=${SHELL:-UNSET}
interpreter_value=$(command -v bash || command -v sh || printf '%s' UNAVAILABLE)
docker_status='EXPECTED_NOT_RUN: LOCAL_DOCKER_DAEMON_UNAVAILABLE'
if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
  docker_status=AVAILABLE
fi

paths_tsv="$work_root/paths.tsv"
results_tsv="$work_root/results.tsv"
: > "$paths_tsv"
: > "$results_tsv"

record_path() {
  local task=$1 path=$2 file=$3
  local stat_line mode owner group parent parent_mode parent_owner parent_group kind
  if stat_line=$(stat -f '%Lp %u %g %HT' "$file" 2>/dev/null); then
    IFS=' ' read -r mode owner group kind <<< "$stat_line"
  else
    stat_line=$(stat -c '%a %u %g %F' "$file")
    IFS=' ' read -r mode owner group kind <<< "$stat_line"
  fi
  parent=$(dirname -- "$file")
  if stat_line=$(stat -f '%Lp %u %g' "$parent" 2>/dev/null); then
    IFS=' ' read -r parent_mode parent_owner parent_group <<< "$stat_line"
  else
    stat_line=$(stat -c '%a %u %g' "$parent")
    IFS=' ' read -r parent_mode parent_owner parent_group <<< "$stat_line"
  fi
  printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n' "$task" "$path" "$mode" "$owner" "$group" "$kind" "$parent_mode" "$parent_owner" "$parent_group" >> "$paths_tsv"
}

for task_path in \
  'TASK-OSS-01|node_modules' \
  'TASK-OSS-03|node_modules' \
  'TASK-OSS-09|.venv/bin/python'; do
  task=${task_path%%|*}
  required_path=${task_path#*|}
  source_root="$work_root/$task/cache"
  negative_root="$work_root/$task/negative_cache"
  mkdir -p "$source_root" "$negative_root"
  mkdir -p "$source_root/$(dirname -- "$required_path")"
  if [[ "$required_path" == */* ]]; then
    printf 'synthetic executable target\n' > "$source_root/$required_path"
  else
    mkdir -p "$source_root/$required_path"
    printf 'synthetic dependency entry\n' > "$source_root/$required_path/entry.txt"
  fi
  chmod -R a-w "$source_root"
  cp -a "$source_root/." "$negative_root/"
  target="$negative_root/$required_path"
  record_path "$task" "$required_path" "$target"
  set +e
  rm -rf "$target" 2>"$work_root/$task-rm.stderr"
  rm_rc=$?
  set -e
  if [[ -e "$target" || -L "$target" ]]; then after=present; else after=absent; fi
  stderr_code=none
  if [[ -s "$work_root/$task-rm.stderr" ]]; then stderr_code=permission-denied-or-platform-equivalent; fi
  printf '%s\t%s\t%s\t%s\t%s\n' "$task" "$required_path" "$rm_rc" "$after" "$stderr_code" >> "$results_tsv"
done

node - "$result_path" "$paths_tsv" "$results_tsv" "$uid_value" "$gid_value" "$groups_value" "$cwd_value" "$shell_value" "$interpreter_value" "$docker_status" <<'NODE'
import { readFileSync, writeFileSync } from 'node:fs';
const [out, pathsFile, resultsFile, uid, gid, groups, cwd, shell, interpreter, docker] = process.argv.slice(2);
const pathRows = readFileSync(pathsFile, 'utf8').trim().split('\n').filter(Boolean).map(line => {
  const [taskId, requiredPath, mode, ownerUid, ownerGid, kind, parentMode, parentOwnerUid, parentOwnerGid] = line.split('\t');
  return {taskId, requiredPath, targetMode: mode, targetOwnerUid: Number(ownerUid), targetOwnerGid: Number(ownerGid), targetKind: kind, parentMode, parentOwnerUid: Number(parentOwnerUid), parentOwnerGid: Number(parentOwnerGid)};
});
const resultRows = readFileSync(resultsFile, 'utf8').trim().split('\n').filter(Boolean).map(line => {
  const [taskId, requiredPath, rmExitCode, targetAfter, stderr] = line.split('\t');
  return {taskId, requiredPath, rmExitCode: Number(rmExitCode), targetAfter, stderr};
});
const obj = {
  schemaVersion: 1,
  benchmarkId: 'GS-OSS-2026-08-02-V6',
  phase: 'G0',
  reproducer: 'V5 operation order: create/cache; chmod -R a-w source cache; cp -a source cache/. into negative_cache/; rm -rf selected required path',
  execution: {platform: process.platform, uid: Number(uid), gid: Number(gid), supplementaryGroups: groups.split(',').filter(Boolean).map(Number), cwd, shell, interpreter, docker},
  cases: resultRows.map(row => ({...row, filesystem: pathRows.find(p => p.taskId === row.taskId)})),
  interpretation: 'A nonzero rm exit with targetAfter=present demonstrates deletion was denied by the read-only copied parent/tree; this is mutation denial, not cache read denial.',
  diagnosticSanitization: {rawStderrStored: false, secretsStored: false, archivesStored: false, virtualenvsStored: false, externalClonesStored: false}
};
writeFileSync(out, JSON.stringify(obj, null, 2) + '\n');
NODE

printf 'reproducer_result=%s\n' "$result_path"
