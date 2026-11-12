/**
 * SP-A-104 — retention defaults must not pin the archive at ~100.
 * Run: npx tsx scripts/test-spa104-retention-defaults.ts
 */
import assert from 'node:assert/strict';
import { loadRetentionConfig } from '../src/lib/retention/cleanup';

const cfg = loadRetentionConfig({});
assert.equal(cfg.minArticles, 500, 'default MIN_ARTICLES should be 500');
assert.equal(cfg.retentionDays, 90, 'default RETENTION_DAYS should be 90');

const legacy = loadRetentionConfig({
  SMARTPROTO_MIN_ARTICLES: '100',
  SMARTPROTO_RETENTION_DAYS: '10',
} as NodeJS.ProcessEnv);
assert.equal(legacy.minArticles, 100);
assert.equal(legacy.retentionDays, 10);

console.log('SP-A-104 retention defaults ok:', cfg);
