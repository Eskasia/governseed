import { spawn } from 'node:child_process';
import fs from 'node:fs';

const [mode = 'safe', ...args] = process.argv.slice(2);

function writeBytes(stream, count, byte = 0x61) {
  const chunk = Buffer.alloc(Math.min(count, 257), byte);
  let remaining = count;
  while (remaining > 0) {
    const length = Math.min(remaining, chunk.length);
    stream.write(chunk.subarray(0, length));
    remaining -= length;
  }
}

switch (mode) {
  case 'safe':
    process.stdout.write('{"ok":true}\n');
    break;
  case 'combined': {
    const stdoutBytes = Number(args[0]);
    const stderrBytes = Number(args[1]);
    writeBytes(process.stdout, stdoutBytes);
    writeBytes(process.stderr, stderrBytes, 0x62);
    break;
  }
  case 'malformed-utf8':
    process.stdout.write(Buffer.from([0x7b, 0x22, 0x78, 0x22, 0x3a, 0xc3, 0x28, 0x7d]));
    break;
  case 'nonzero':
    process.stdout.write('{"ok":false}\n');
    process.exitCode = Number(args[0] ?? 7);
    break;
  case 'sleep':
    setTimeout(() => process.stdout.write('{"late":true}\n'), Number(args[0] ?? 1_000));
    break;
  case 'canary':
    process.stdout.write(String(args[0] ?? ''));
    process.stderr.write(String(args[1] ?? args[0] ?? ''));
    break;
  case 'env-keys':
    process.stdout.write(JSON.stringify(Object.keys(process.env).sort()) + '\n');
    break;
  case 'descendant': {
    const sentinel = args[0];
    const delay = Number(args[1] ?? 500);
    spawn(
      process.execPath,
      ['-e', `setTimeout(() => require('node:fs').writeFileSync(process.argv[1], 'late'), ${delay})`, sentinel],
      { detached: false, stdio: 'ignore' },
    );
    setTimeout(() => {}, delay * 4);
    break;
  }
  case 'leader-exit-descendant': {
    const sentinel = args[0];
    const delay = Number(args[1] ?? 300);
    const exitCode = Number(args[2] ?? 0);
    const descendant = spawn(
      process.execPath,
      ['-e', `setTimeout(() => require('node:fs').writeFileSync(process.argv[1], 'late'), ${delay})`, sentinel],
      { detached: false, stdio: 'ignore' },
    );
    descendant.unref();
    process.exitCode = exitCode;
    break;
  }
  case 'leader-exit-detached-descendant': {
    const sentinel = args[0];
    const pidFile = args[1];
    const delay = Number(args[2] ?? 250);
    const descendant = spawn(
      process.execPath,
      [
        '-e',
        `setTimeout(() => { require('node:fs').writeFileSync(process.argv[1], 'late'); setTimeout(() => {}, 10_000); }, ${delay})`,
        sentinel,
      ],
      { detached: true, stdio: 'ignore' },
    );
    fs.writeFileSync(pidFile, String(descendant.pid), 'utf8');
    descendant.unref();
    break;
  }
  case 'write':
    fs.writeFileSync(args[0], args[1] ?? 'changed', 'utf8');
    process.stdout.write('{"ok":true}\n');
    break;
  default:
    process.exitCode = 64;
}
