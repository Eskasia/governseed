import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, readlinkSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const root = path.resolve(process.argv[2] || '');
if (!root || root === path.parse(root).root) throw new Error('usage: node seed-tree-hash.mjs <git-worktree>');

const tracked = execFileSync('git', ['-C', root, 'ls-files', '-z'], { encoding: 'buffer' })
  .toString('utf8')
  .split('\0')
  .filter(Boolean)
  .sort();
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const lines = tracked.map((relative) => {
  const absolute = path.join(root, relative);
  const stat = lstatSync(absolute);
  const value = stat.isSymbolicLink()
    ? digest(Buffer.from(readlinkSync(absolute), 'utf8'))
    : digest(readFileSync(absolute));
  return value + '  ' + relative + '\n';
});
process.stdout.write(digest(Buffer.from(lines.join(''), 'utf8')) + '\n');
