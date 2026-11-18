import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PICOMATCH_ADVISORY, unexpectedHigh } from './audit-high-with-exception.mjs';

const viaPicomatch = { name: 'picomatch', severity: 'high', url: PICOMATCH_ADVISORY };
const report = { vulnerabilities: {
  picomatch: { severity: 'high', via: [viaPicomatch] },
  fdir: { severity: 'high', via: ['picomatch'] },
  vite: { severity: 'high', via: ['fdir', 'picomatch'] },
  vitest: { severity: 'high', via: ['picomatch', { name: '@vitest/mocker', severity: 'moderate' }] },
} };
test('only the registered advisory is exempted for dev dependencies', () => {
  assert.deepEqual(unexpectedHigh(report, true), []);
  assert.equal(unexpectedHigh(report).length, 4);
  const changed = structuredClone(report);
  changed.vulnerabilities.picomatch.via.push({ name: 'picomatch', severity: 'high', url: 'https://github.com/advisories/other' });
  assert.deepEqual(unexpectedHigh(changed, true).sort(), ['fdir', 'picomatch', 'vite', 'vitest']);
});
test('unknown direct high, cycles, invalid audit reports fail closed', () => {
  assert.deepEqual(unexpectedHigh({ vulnerabilities: { unexpected: { severity: 'critical', via: [{ name: 'unexpected', severity: 'critical', url: 'unknown' }] } } }, true), ['unexpected']);
  assert.deepEqual(unexpectedHigh({ vulnerabilities: { loop: { severity: 'high', via: ['loop'] } } }, true), ['loop']);
  assert.throws(() => unexpectedHigh({ error: { code: 'EAI_AGAIN' } }, true), /Invalid npm audit/);
});
