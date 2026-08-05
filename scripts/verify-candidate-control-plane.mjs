#!/usr/bin/env node
import fs from 'node:fs';
import {
  verifyControlPlane,
} from './lib/candidate-control-plane.mjs';

function parseArgs(argv) {
  const values = { branchRole: 'candidate' };
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith('--') || value === undefined) throw new Error(`invalid argument near ${key ?? '<end>'}`);
    values[key.slice(2)] = value;
  }
  return values;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

try {
  const args = parseArgs(process.argv.slice(2));
  for (const required of ['policy', 'event', 'comment-json', 'observed-head', 'observed-tree']) {
    if (!args[required]) throw new Error(`missing --${required}`);
  }
  const policy = readJson(args.policy);
  const event = readJson(args.event);
  const apiComment = readJson(args['comment-json']);
  const previousEvent = args['previous-event'] ? readJson(args['previous-event']) : null;
  const changedPaths = args['changed-paths']
    ? fs.readFileSync(args['changed-paths'], 'utf8').split(/\r?\n/u).filter(Boolean)
    : [];
  const errors = verifyControlPlane({
    policy,
    event,
    apiComment,
    previousEvent,
    observedHead: args['observed-head'],
    observedTree: args['observed-tree'],
    changedPaths,
    branchRole: args['branch-role'],
  });
  const report = { schemaVersion: 1, status: errors.length === 0 ? 'PASS' : 'FAIL', errors };
  process.stdout.write(`${JSON.stringify(report)}\n`);
  process.exitCode = errors.length === 0 ? 0 : 1;
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 2;
}
