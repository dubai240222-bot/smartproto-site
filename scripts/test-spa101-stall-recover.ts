/**
 * SP-A-101 — probes for expire-mode / holdOff contract.
 * Run: npx tsx scripts/test-spa101-stall-recover.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const workerSrc = readFileSync(path.resolve(__dirname, 'hetzner-worker.ts'), 'utf8');
const cliSrc = readFileSync(path.resolve(__dirname, 'hetzner-cli.sh'), 'utf8');

assert.match(workerSrc, /TEST_AUTO_EXPIRE_MODE/);
assert.match(workerSrc, /SMARTPROTO_TEST_AUTO_EXPIRE_MODE \|\| 'auto'/);
assert.match(workerSrc, /maybeRecoverStalledOff/);
assert.match(workerSrc, /holdOff: true, reason: 'single-complete'/);
assert.match(workerSrc, /writeMode\(TEST_AUTO_EXPIRE_MODE/);
assert.match(workerSrc, /DEFAULT_MODE/);
assert.doesNotMatch(workerSrc, /TEST-AUTO duration .* — switching to OFF\./);

assert.match(cliSrc, /holdOff":true/);
assert.match(cliSrc, /will not auto-recover/);

console.log('SP-A-101 stall-recover contract probes passed.');
