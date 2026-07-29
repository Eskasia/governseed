import { spawn as nodeSpawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export const MAX_COMBINED_OUTPUT_BYTES = 65_536;

const EXIT_BY_CODE = Object.freeze({
  RUNTIME_MISSING: 4,
  SESSION_SAFETY_UNAVAILABLE: 2,
  CHILD_SPAWN_FAILED: 3,
  OUTPUT_LIMIT_EXCEEDED: 3,
  OUTPUT_SCHEMA_INVALID: 3,
  PRIVACY_OUTPUT_BLOCKED: 3,
  PROCESS_TREE_UNAVAILABLE: 3,
  MINIMAL_ENV_VIOLATION: 3,
});

export class GovernanceImpactError extends Error {
  constructor(code, exitCode = EXIT_BY_CODE[code] ?? 3) {
    super(code);
    this.name = 'GovernanceImpactError';
    this.code = code;
    this.exitCode = exitCode;
  }
}

function fail(code, exitCode) {
  throw new GovernanceImpactError(code, exitCode);
}

function requireToken(value, code = 'SESSION_SAFETY_UNAVAILABLE') {
  if (typeof value !== 'string' || value.length === 0 || value.includes('\0')) fail(code);
  return value;
}

export function runtimeCapabilities(runtime, platform = process.platform) {
  if (runtime === 'synthetic') {
    return {
      available: true,
      noSessionPersistence: true,
      workspaceOnly: true,
      processTree: true,
    };
  }
  if (runtime === 'codex') {
    const posix = platform === 'darwin' || platform === 'linux';
    return {
      available: true,
      noSessionPersistence: posix,
      workspaceOnly: posix,
      processTree: false,
    };
  }
  if (runtime === 'claude' || runtime === 'antigravity') {
    return {
      available: true,
      noSessionPersistence: false,
      workspaceOnly: false,
      processTree: platform !== 'win32',
    };
  }
  return {
    available: false,
    noSessionPersistence: false,
    workspaceOnly: false,
    processTree: false,
  };
}

const BIN_VARIABLES = Object.freeze({
  codex: 'CODEX_BIN',
  claude: 'CLAUDE_BIN',
  antigravity: 'ANTIGRAVITY_BIN',
});

const DEFAULT_BINARIES = Object.freeze({
  codex: 'codex',
  claude: 'claude',
  antigravity: 'antigravity',
});

const WINDOWS_NATIVE_EXTENSIONS = new Set(['.exe', '.com']);

function isDirectlySpawnable(candidate, platform) {
  return platform !== 'win32'
    || WINDOWS_NATIVE_EXTENSIONS.has(path.extname(candidate).toLowerCase());
}

function canExecute(candidate, fsApi) {
  try {
    fsApi.accessSync(candidate, fsApi.constants?.X_OK);
    return true;
  } catch {
    return false;
  }
}

export function resolveRuntimeExecutable(
  runtime,
  env = process.env,
  platform = process.platform,
  fsApi = fs,
) {
  const variable = BIN_VARIABLES[runtime];
  const fallback = DEFAULT_BINARIES[runtime];
  if (!variable || !fallback) return null;
  const configured = env?.[variable];
  if (configured !== undefined) {
    if (typeof configured !== 'string' || configured.length === 0 || configured.includes('\0')) {
      return null;
    }
    if (!isDirectlySpawnable(configured, platform)) return null;
    return canExecute(configured, fsApi) ? configured : null;
  }

  const pathValue = typeof env?.PATH === 'string' ? env.PATH : '';
  const extensions =
    platform === 'win32'
      ? String(env?.PATHEXT ?? '.EXE;.CMD;.BAT;.COM')
          .split(';')
          .map((extension) => extension.trim())
          .filter((extension) => WINDOWS_NATIVE_EXTENSIONS.has(extension.toLowerCase()))
      : [''];
  for (const directory of pathValue.split(path.delimiter).filter(Boolean)) {
    for (const extension of extensions) {
      const candidate = path.join(directory, fallback + extension);
      if (canExecute(candidate, fsApi)) return candidate;
    }
  }
  return null;
}

export function buildMinimalEnv(runtime, armPaths, options = {}) {
  const platform = options.platform ?? process.platform;
  const source = options.sourceEnv ?? process.env;
  const home = requireToken(armPaths?.home, 'MINIMAL_ENV_VIOLATION');
  const tmp = requireToken(armPaths?.tmp, 'MINIMAL_ENV_VIOLATION');
  if (platform === 'win32') {
    const environment = {
      PATH: String(source.PATH ?? ''),
      PATHEXT: String(source.PATHEXT ?? ''),
      SystemRoot: String(source.SystemRoot ?? ''),
      WINDIR: String(source.WINDIR ?? ''),
      USERPROFILE: home,
      TEMP: tmp,
      TMP: tmp,
      NO_COLOR: '1',
    };
    return environment;
  }
  const environment = {
    PATH: String(source.PATH ?? ''),
    LANG: 'C.UTF-8',
    LC_ALL: 'C.UTF-8',
    HOME: home,
    TMPDIR: tmp,
    NO_COLOR: '1',
  };
  if (runtime === 'codex') {
    environment.CODEX_HOME = requireToken(
      armPaths?.codexHome ?? options.codexHome,
      'SESSION_SAFETY_UNAVAILABLE',
    );
  }
  return environment;
}

export function buildCodexRuntimeCommand(workspace, taskFile, options = {}) {
  const executable = requireToken(options.executable, 'RUNTIME_MISSING');
  requireToken(workspace);
  requireToken(taskFile);
  const model = requireToken(options.model);
  const responseSchema = requireToken(options.responseSchema);
  const stdin = [
    'Complete the task described in the copied repository-relative file ' + taskFile + '.',
    'Work only inside the supplied workspace and return only the trusted structured response.',
  ].join(' ');
  return {
    executable,
    args: [
      'exec',
      '--ephemeral',
      '--ignore-user-config',
      '--strict-config',
      '--sandbox',
      'workspace-write',
      '--cd',
      workspace,
      '--model',
      model,
      '--output-schema',
      responseSchema,
      '--color',
      'never',
      '--config',
      'web_search="disabled"',
      '--config',
      'shell_environment_policy.inherit=none',
      '-',
    ],
    stdin,
  };
}

export function buildRuntimeCommand(runtime, workspace, taskFile, options = {}) {
  const capabilities = runtimeCapabilities(runtime, options.platform);
  if (
    !capabilities.available ||
    !capabilities.noSessionPersistence ||
    !capabilities.workspaceOnly ||
    !capabilities.processTree
  ) {
    fail('SESSION_SAFETY_UNAVAILABLE', 2);
  }
  if (runtime === 'synthetic') {
    requireToken(workspace);
    requireToken(taskFile);
    return {
      executable: requireToken(options.executable, 'RUNTIME_MISSING'),
      args: Array.isArray(options.args) ? [...options.args] : [],
      stdin: typeof options.stdin === 'string' ? options.stdin : '',
    };
  }
  if (runtime !== 'codex') fail('SESSION_SAFETY_UNAVAILABLE', 2);
  return buildCodexRuntimeCommand(workspace, taskFile, options);
}

function signalProcessGroup(child, signal, platform, killImpl) {
  try {
    if (platform !== 'win32' && Number.isInteger(child.pid) && child.pid > 0) {
      killImpl(-child.pid, signal);
    } else {
      child.kill(signal);
    }
    return 'signaled';
  } catch (error) {
    if (error?.code === 'ESRCH') return 'absent';
    return 'failed';
  }
}

export async function terminateProcessTree(child, options = {}) {
  if (!child) return;
  const platform = options.platform ?? process.platform;
  if (platform === 'win32' && options.realExecution === true) {
    fail('PROCESS_TREE_UNAVAILABLE');
  }
  const killImpl = options.killImpl ?? process.kill.bind(process);
  const scheduler = options.scheduler ?? {
    setTimeout,
    clearTimeout,
  };
  const graceMs = options.killGraceMs ?? 100;
  if (platform !== 'win32') {
    const probe = signalProcessGroup(child, 0, platform, killImpl);
    if (probe === 'failed') fail('PROCESS_TREE_UNAVAILABLE');
    if (probe === 'signaled') {
      if (signalProcessGroup(child, 'SIGTERM', platform, killImpl) === 'failed') {
        fail('PROCESS_TREE_UNAVAILABLE');
      }
      await new Promise((resolve) => scheduler.setTimeout(resolve, graceMs));
      const afterTerm = signalProcessGroup(child, 0, platform, killImpl);
      if (afterTerm === 'failed') fail('PROCESS_TREE_UNAVAILABLE');
      if (afterTerm === 'signaled') {
        if (signalProcessGroup(child, 'SIGKILL', platform, killImpl) === 'failed') {
          fail('PROCESS_TREE_UNAVAILABLE');
        }
        await new Promise((resolve) => scheduler.setTimeout(resolve, graceMs));
        if (signalProcessGroup(child, 0, platform, killImpl) !== 'absent') {
          fail('PROCESS_TREE_UNAVAILABLE');
        }
      }
    }
  }
  if (options.descendantAlive && (await options.descendantAlive(child))) {
    fail('PROCESS_TREE_UNAVAILABLE');
  }
}

function normalizeChildError(error, fallback) {
  if (
    error &&
    typeof error.code === 'string' &&
    Number.isInteger(error.exitCode)
  ) {
    return error;
  }
  return new GovernanceImpactError(fallback);
}

export function runChildSafely(executable, args, options = {}) {
  requireToken(executable, 'CHILD_SPAWN_FAILED');
  if (!Array.isArray(args) || args.some((entry) => typeof entry !== 'string' || entry.includes('\0'))) {
    return Promise.reject(new GovernanceImpactError('CHILD_SPAWN_FAILED'));
  }
  const spawnImpl = options.spawnImpl ?? nodeSpawn;
  const platform = options.platform ?? process.platform;
  const scheduler = options.scheduler ?? { setTimeout, clearTimeout };
  const clock = options.clock ?? (() => Number(process.hrtime.bigint() / 1_000_000n));
  const timeoutMs = options.timeoutMs ?? 120_000;
  const maxBytes = options.maxOutputBytes ?? MAX_COMBINED_OUTPUT_BYTES;

  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawnImpl(executable, args, {
        cwd: options.cwd,
        env: options.env,
        shell: false,
        detached: platform !== 'win32',
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
      });
    } catch {
      reject(new GovernanceImpactError('CHILD_SPAWN_FAILED'));
      return;
    }

    const startedAt = clock();
    const stdoutChunks = [];
    const stderrChunks = [];
    let combinedBytes = 0;
    let terminalError = null;
    let timedOut = false;
    let settled = false;
    let terminationStarted = false;
    let terminationPromise = null;

    const terminate = () => {
      if (terminationStarted) return terminationPromise;
      terminationStarted = true;
      terminationPromise = terminateProcessTree(child, {
        platform,
        killImpl: options.killImpl,
        scheduler,
        killGraceMs: options.killGraceMs,
        descendantAlive: options.descendantAlive,
        realExecution: options.realExecution,
      }).catch((error) => {
        terminalError = normalizeChildError(error, 'PROCESS_TREE_UNAVAILABLE');
      });
      return terminationPromise;
    };
    const capture = (target) => (chunk) => {
      if (terminalError) return;
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      combinedBytes += bytes.length;
      if (combinedBytes > maxBytes) {
        terminalError = new GovernanceImpactError('OUTPUT_LIMIT_EXCEEDED');
        stdoutChunks.length = 0;
        stderrChunks.length = 0;
        terminate();
        return;
      }
      target.push(bytes);
    };
    child.stdout?.on('data', capture(stdoutChunks));
    child.stderr?.on('data', capture(stderrChunks));

    const timeout = scheduler.setTimeout(() => {
      timedOut = true;
      terminate();
    }, timeoutMs);
    if (typeof timeout?.unref === 'function') timeout.unref();

    child.once('error', (error) => {
      if (settled) return;
      terminalError =
        error?.code === 'ENOENT'
          ? new GovernanceImpactError('RUNTIME_MISSING', 4)
          : new GovernanceImpactError('CHILD_SPAWN_FAILED');
    });
    child.once('close', async (code, signal) => {
      if (settled) return;
      settled = true;
      scheduler.clearTimeout(timeout);
      if (!terminationPromise) terminate();
      await terminationPromise;
      if (terminalError) {
        reject(terminalError);
        return;
      }
      const stdoutBuffer = Buffer.concat(stdoutChunks);
      const stderrBuffer = Buffer.concat(stderrChunks);
      try {
        const scanner = options.privacyScanner;
        if (scanner) {
          scanner(stdoutBuffer, { surface: 'child-stdout' });
          scanner(stderrBuffer, { surface: 'child-stderr' });
        }
        const decoder = new TextDecoder('utf-8', { fatal: true });
        const stdout = decoder.decode(stdoutBuffer);
        const stderr = decoder.decode(stderrBuffer);
        resolve({
          status: timedOut ? 'timeout' : code === 0 ? 'completed' : 'failed',
          errorCode: timedOut ? 'CHILD_TIMEOUT' : code === 0 ? null : 'CHILD_EXIT_NONZERO',
          exitCode: typeof code === 'number' ? code : null,
          signal: signal ?? null,
          stdout,
          stderr,
          wallTimeMs: Math.max(0, clock() - startedAt),
        });
      } catch (error) {
        reject(
          error?.code === 'PRIVACY_SOURCE_BLOCKED'
            ? new GovernanceImpactError('PRIVACY_OUTPUT_BLOCKED')
            : normalizeChildError(error, 'OUTPUT_SCHEMA_INVALID'),
        );
      }
    });

    try {
      child.stdin?.end(options.stdin ?? '');
    } catch {
      terminalError = new GovernanceImpactError('CHILD_SPAWN_FAILED');
      terminate();
    }
  });
}
