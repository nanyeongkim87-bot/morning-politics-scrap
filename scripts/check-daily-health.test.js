const test = require('node:test');
const assert = require('node:assert/strict');
const { evaluateHealth } = require('./check-daily-health');

const expectedDate = '20260904';
const afterCutoff = new Date('2026-09-04T00:00:00Z');

test('reports a healthy scheduled publication', () => {
  const result = evaluateHealth({
    expectedDate,
    now: afterCutoff,
    runs: [{ event: 'schedule', conclusion: 'success', created_at: '2026-09-03T21:20:00Z' }],
    archiveHasDate: true,
    liveHasDate: true,
  });
  assert.equal(result.status, 'healthy');
  assert.equal(result.scheduler, 'created');
});

test('distinguishes a missed schedule from a recovered publication', () => {
  const result = evaluateHealth({
    expectedDate,
    now: afterCutoff,
    runs: [{ event: 'push', conclusion: 'success', created_at: '2026-09-03T21:55:49Z' }],
    archiveHasDate: true,
    liveHasDate: true,
  });
  assert.equal(result.status, 'recovered_without_schedule');
  assert.equal(result.scheduler, 'missing');
});

test('treats a stale live page as critical', () => {
  const result = evaluateHealth({
    expectedDate,
    now: afterCutoff,
    runs: [{ event: 'schedule', conclusion: 'success', created_at: '2026-09-03T21:20:00Z' }],
    archiveHasDate: true,
    liveHasDate: false,
  });
  assert.equal(result.status, 'critical');
  assert.match(result.issues.join(' '), /deployed page/);
});

test('does not call an upcoming schedule missing before cutoff', () => {
  const result = evaluateHealth({
    expectedDate,
    now: new Date('2026-09-03T21:00:00Z'),
    runs: [],
    archiveHasDate: false,
    liveHasDate: false,
  });
  assert.equal(result.scheduler, 'pending');
});
