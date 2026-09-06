/**
 * SP-A-091 — unit checks for freshness SLA helpers (no API, no network).
 */
import assert from 'node:assert/strict';
import {
  FRESHNESS_CRITICAL_MS,
  FRESHNESS_WARNING_MS,
  buildFreshnessReport,
  freshnessStatusFromAgeMs,
  isAutoPublicationAgent,
  pipelineBudgetForStatus,
} from '../src/lib/newsroom/freshness';

assert.equal(freshnessStatusFromAgeMs(0), 'OK');
assert.equal(freshnessStatusFromAgeMs(FRESHNESS_WARNING_MS - 1), 'OK');
assert.equal(freshnessStatusFromAgeMs(FRESHNESS_WARNING_MS), 'WARNING');
assert.equal(freshnessStatusFromAgeMs(FRESHNESS_CRITICAL_MS - 1), 'WARNING');
assert.equal(freshnessStatusFromAgeMs(FRESHNESS_CRITICAL_MS), 'CRITICAL');
assert.equal(freshnessStatusFromAgeMs(null), 'CRITICAL');

assert.equal(pipelineBudgetForStatus('OK'), 4);
assert.equal(pipelineBudgetForStatus('WARNING'), 4);
assert.equal(pipelineBudgetForStatus('CRITICAL'), 5);

assert.equal(isAutoPublicationAgent('newsroom-scout'), true);
assert.equal(isAutoPublicationAgent('reader-scout'), true);
assert.equal(isAutoPublicationAgent(null), true);
assert.equal(isAutoPublicationAgent('chief-fast-lane'), false);
assert.equal(isAutoPublicationAgent('author-door'), false);

const now = new Date('2026-08-12T12:00:00.000Z');
const report = buildFreshnessReport({
  now,
  articles: [
    {
      publishedAt: '2026-08-12T08:00:00.000Z',
      agentId: 'newsroom-scout',
    },
    {
      publishedAt: '2026-08-12T11:00:00.000Z',
      agentId: 'chief-fast-lane',
    },
  ],
  journalEntries: [
    {
      processedAt: '2026-08-12T10:00:00.000Z',
      status: 'rejected',
      reason: 'draft too short (164 < 180)',
    },
    {
      processedAt: '2026-08-12T10:05:00.000Z',
      status: 'rejected',
      reason: 'draft too short (164 < 180)',
    },
    {
      processedAt: '2026-08-12T10:30:00.000Z',
      status: 'published',
      reason: 'ok',
    },
  ],
});

assert.equal(report.lastAutoPublicationAt, '2026-08-12T08:00:00.000Z');
assert.equal(report.minutesSinceLastAutoPublication, 240);
assert.equal(report.freshnessStatus, 'CRITICAL');
assert.equal(report.pipelineCandidateBudget, 5);
assert.equal(report.publicationsLast24h, 1);
assert.ok(report.topZeroPublishReasons[0]?.reason.includes('draft too short'));

console.log('test-freshness-sla: PASS');
