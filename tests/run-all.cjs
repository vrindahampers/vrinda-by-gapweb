#!/usr/bin/env node
/**
 * Runs every harness in tests/ and adds up their summaries.
 *
 * Each harness is a standalone script with its own exit code, so this spawns
 * them in order and re-prints what they print. Add a harness by dropping the
 * file in this folder and listing it below.
 *
 * Usage: node tests/run-all.cjs
 * Exits 1 if any check failed or any harness crashed.
 */

'use strict';

const { spawnSync } = require('child_process');
const path = require('path');

const HARNESSES = [
  'order-service-harness.cjs',   // the file the portals depend on for their feeds
  'admin-stats-harness.cjs',     // the dashboard numbers, period windows included
  'order-feed-harness.cjs'       // the three portals that render those feeds
];

let passed = 0;
let failed = 0;
const problems = [];

for (const harness of HARNESSES) {
  const result = spawnSync(process.execPath, [path.join(__dirname, harness)], { encoding: 'utf8' });
  process.stdout.write(result.stdout || '');
  if (result.stderr) process.stderr.write(result.stderr);

  const summary = /(\d+) passed, (\d+) failed/.exec(result.stdout || '');
  if (summary) {
    passed += Number(summary[1]);
    failed += Number(summary[2]);
    if (Number(summary[2])) problems.push(harness + ' (' + summary[2] + ' failing checks)');
  } else {
    problems.push(harness + ' (crashed before printing a summary)');
  }
}

console.log('\n' + '='.repeat(60));
console.log(passed + ' checks passed, ' + failed + ' failed, across ' + HARNESSES.length + ' harnesses');
if (problems.length) {
  console.log('\nNeeds attention:');
  problems.forEach((problem) => console.log('  - ' + problem));
  process.exitCode = 1;
}
