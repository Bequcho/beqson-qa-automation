import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePlaywright, reviewOnlyProbe, safeSummary } from '../lib/report.mjs';
import { validate } from '../lib/protocol.mjs';

test('read-only official probe has a strictly registered scenario identifier', () => {
  assert.equal(validate('RUN_SCENARIO', { scenarioId: 'official.voice-kit.02' }).command, 'RUN_SCENARIO');
  assert.throws(() => validate('RUN_SCENARIO', { scenarioId: 'official.voice-kit.02', url: 'https://example.invalid' }));
});

test('actual Playwright evidence is correctly attributed to the official criterion', () => {
  const report = { suites: [{ specs: [{
    title: 'official.voice-kit.02 stock-voice preview evidence probe',
    tests: [{ results: [{ status: 'passed', steps: [{ title: 'Preview Ike' }] }] }]
  }] }] };
  const checks = parsePlaywright(report);
  assert.equal(checks.length, 1);
  assert.equal(checks[0].scenarioId, 'official.voice-kit.02');
  assert.equal(checks[0].status, 'PASS');
  assert.deepEqual(checks[0].actions, ['Preview Ike']);
});

test('passing a partial preview always downgrades to review-required, without changing evidence', () => {
  const original = { scenarioId: 'official.voice-kit.02', status: 'PASS', evidence: [{ path: 'private' }] };
  const checked = reviewOnlyProbe(original);
  assert.equal(checked.status, 'BLOCKED');
  assert.equal(checked.reason, 'FULL_WORKFLOW_REVIEW_REQUIRED');
  assert.deepEqual(checked.evidence, original.evidence);
  assert.equal(original.status, 'PASS');
  for (const status of ['FAIL', 'BLOCKED', 'NOT TESTED']) {
    assert.equal(reviewOnlyProbe({ status }).status, status);
  }
});

test('the GitHub result never leaks local evidence or falsely completes official criteria', () => {
  const check = reviewOnlyProbe({
    scenarioId: 'official.voice-kit.02', status: 'PASS', reason: 'ASSERTIONS_VERIFIED',
    actual: 'private script', evidence: [{ path: 'C:/private/audio.mp3' }]
  });
  const summary = safeSummary({ runId: 'test', command: 'RUN_SCENARIO', outcome: 'BLOCKED', checks: [check] });
  assert.equal(summary.officialItemsAutoCompleted, 0);
  assert.equal(summary.checkResults[0].status, 'BLOCKED');
  assert.equal(summary.checkResults[0].reason, 'FULL_WORKFLOW_REVIEW_REQUIRED');
  assert.equal(JSON.stringify(summary).includes('C:/private'), false);
});
