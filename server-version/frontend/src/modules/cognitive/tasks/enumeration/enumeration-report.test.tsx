import React from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { EnumerationReport } from './EnumerationReport'
import { ENUMERATION_IDENTITY, enumerationConfig } from './generated/protocol'
import type { EnumerationPublicResult, EnumerationStoredSnapshot } from './generated/report'
afterEach(cleanup)
const config = enumerationConfig('experience'), seed = 'synthetic-report-only-not-device-evidence'
/** Explicit synthetic report fixtures, no capture/seed trial generation or production endpoint. */
function fixture(partial = false, zeroCorrect = false): EnumerationPublicResult {
  const included = partial ? 1 : 25
  const byQuantity = [5, 6, 7, 8, 9].map((targetValue, i) => {
    const n = partial ? Number(i === 0) : 5
    return { targetValue, expected: 5, observed: n, included: n, correct: zeroCorrect ? 0 : n,
      overReported: 0, underReported: zeroCorrect ? n : 0, accuracy: n ? Number(!zeroCorrect) : null,
      signedMeanError: n ? (zeroCorrect ? -1 : 0) : null, meanAbsoluteError: n ? Number(zeroCorrect) : null,
      medianReportOperationMs: n ? 300 : null }
  })
  return { metrics: { reportBinding: { candidateId: ENUMERATION_IDENTITY.candidateId, engineVersion: '0.1.0',
    scoringVersion: '0.2.0', configVersion: '0.2.0', config, randomSeed: seed, configHash: '0'.repeat(64), protocolSignature: '1'.repeat(64) },
    expectedTrialCount: 25, receivedTrialCount: included, includedTrialCount: included, excludedTrialCount: 0,
    correctTrialCount: zeroCorrect ? 0 : included, overReportedTrialCount: 0, underReportedTrialCount: zeroCorrect ? included : 0,
    excludedTrialIndices: [], excludedTrialReasons: {}, byQuantity, overallAccuracy: Number(!zeroCorrect),
    signedMeanError: zeroCorrect ? -1 : 0, meanAbsoluteError: Number(zeroCorrect), medianReportOperationMs: 300 },
    quality: { state: partial ? 'limited' : 'interpretable', flags: { descriptiveOnly: true, noIncludedRecords: false,
      incompleteRecords: partial, technicalExclusions: false }, reasons: [] }, audit: { trialCount: included, scorerVersion: '0.2.0' } }
}
describe('enumeration product descriptive report UI', () => {
  it.each(['zh', 'en'] as const)('shows only true synthetic session counts in %s, without norms or raw bindings', language => {
    const { container } = render(<EnumerationReport result={fixture()} config={config} randomSeed={seed} language={language} />)
    expect(container.querySelector('[data-report-state="interpretable"]')).not.toBeNull()
    expect(screen.getByRole('heading').textContent).toContain('25')
    expect(container.textContent).toContain(language === 'en' ? 'more dots on 0 trials and fewer on 0 trials' : '偏多0次，偏少0次')
    expect(container.textContent).not.toContain(seed)
    expect(container.textContent).not.toMatch(/percentile|excellent|diagnos|同龄|优秀|较差|能力等级/)
  })
  it.each(['zh', 'en'] as const)('describes partial records with explicit expected, received and included counts in %s', language => {
    const { container } = render(<EnumerationReport result={fixture(true)} config={config} randomSeed={seed} language={language} />)
    expect(container.querySelector('[data-report-state="limited"]')).not.toBeNull()
    expect(container.textContent).toContain(language === 'en' ? '1 of 25 planned trials' : '计划25次，已记录1次')
    expect(container.textContent).toContain(language === 'en' ? 'partial record' : '部分记录')
    expect(container.textContent).not.toContain(language === 'en' ? 'All 25' : '均已记录')
  })
  it('preserves actual zero correctness and fewer responses instead of hiding them or clipping signed error', () => {
    const { container } = render(<EnumerationReport result={fixture(false, true)} config={config} randomSeed={seed} language="zh" />)
    expect(container.querySelector('[data-report-state="interpretable"]')).not.toBeNull()
    expect(screen.getByRole('heading').textContent).toContain('0次判断正确')
    expect(container.textContent).toContain('偏少25次')
  })
  it('hides a missing or incompatible result without converting it to 0/25', () => {
    const { container, rerender } = render(<EnumerationReport config={config} randomSeed={seed} language="zh" />)
    expect(container.querySelector('[data-report-state="invalid"]')).not.toBeNull()
    expect(container.textContent).not.toContain('0次判断正确')
    rerender(<EnumerationReport result={fixture()} config={config} randomSeed={seed + ':different-attempt'} language="en" />)
    expect(container.querySelector('[data-report-state="invalid"]')).not.toBeNull()
    expect(screen.getByRole('heading').textContent).toContain('No usable result')
  })
  it('cannot release a forged state or old frozen report through the participant component', () => {
    const result = fixture(true); result.quality.state = 'interpretable'
    const { container, rerender } = render(<EnumerationReport result={result} config={config} randomSeed={seed} language="zh" />)
    expect(container.querySelector('[data-report-state="invalid"]')).not.toBeNull()
    const old = fixture(); old.audit!.scorerVersion = '0.1.0'
    rerender(<EnumerationReport result={old} config={config} randomSeed={seed} language="zh" />)
    expect(container.querySelector('[data-report-state="invalid"]')).not.toBeNull()
  })
})


describe('enumeration stored report UI adapter', () => {
  it('renders a compatible stored snapshot without audit and hides ambiguous live-plus-stored props', () => {
    const result = fixture()
    const snapshot: EnumerationStoredSnapshot = { schemaVersion: 1, completedAt: '2026-10-26T09:20:00.000Z',
      testType: 'enumeration', configVersion: '0.2.0', engineVersion: '0.1.0', scoringVersion: '0.2.0',
      protocolSignature: '1'.repeat(64), profile: 'experience', metrics: result.metrics, quality: result.quality,
      references: [], report: {}, assessmentContext: null }
    const { container, rerender } = render(<EnumerationReport storedResult={snapshot} config={config} randomSeed={seed} language="zh" />)
    expect(container.querySelector('[data-report-state="interpretable"]')).not.toBeNull()
    expect(screen.getByRole('heading').textContent).toContain('25次判断正确')
    rerender(<EnumerationReport storedResult={snapshot} result={result} config={config} randomSeed={seed} language="zh" />)
    expect(container.querySelector('[data-report-state="invalid"]')).not.toBeNull()
    const old = structuredClone(snapshot); old.scoringVersion = '0.1.0'
    rerender(<EnumerationReport storedResult={old} config={config} randomSeed={seed} language="en" />)
    expect(container.querySelector('[data-report-state="invalid"]')).not.toBeNull()
  })
})
