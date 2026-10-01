import { describe, expect, it } from 'vitest'
import { buildSituationalCsv, buildSituationalExportPayload } from '../export'
import type { SituationalAttemptResponse } from '../types'

const result: SituationalAttemptResponse = {
  attemptId: 'attempt-1',
  attempt: {
    id: 'attempt-1', instrumentKey: 'pilot', instrumentVersion: '1.0.0', attemptNo: 1, status: 'COMPLETED', deliveryMode: 'FINAL_ONLY', runtimeGeneration: 'UNIFIED_V1', attemptEpoch: 1, progress: 100, definitionHash: 'a'.repeat(64), compiledRuntimeHash: 'b'.repeat(64), scorerKey: 'situational.default', scoringVersion: 'pilot-v1', submissionId: 'submission-123456', submissionPayloadHash: 'c'.repeat(64), submittedAt: '2026-09-08T00:00:00.000Z', startedAt: '2026-09-08T00:00:00.000Z', completedAt: '2026-09-08T00:01:00.000Z', totalTime: 60000, createdAt: '2026-09-08T00:00:00.000Z', updatedAt: '2026-09-08T00:01:00.000Z',
  },
  instrument: {
    key: 'pilot', version: '1.0.0', releaseStatus: 'PUBLISHED', scienceMaturity: 'PILOT', definitionHash: 'a'.repeat(64), compiledRuntimeHash: 'b'.repeat(64), scorerKey: 'situational.default', scoringVersion: 'pilot-v1', frozenAt: '2026-09-08T00:00:00.000Z', sampling: { strategy: 'ALL' }, definition: { schemaVersion: 1, respondentType: 'participant_self_report', sampling: { strategy: 'ALL' }, scenes: [] }, report: { reportVersion: 'v1', primaryMetricKeys: ['metric'], metricOrder: ['metric'], interpretations: [], limitations: ['provisional'], disclaimer: 'Pilot only' }, referencePolicy: { type: 'none' }, runtimeCapabilities: { standalone: true, embedded: false, aggregateEligible: false, collectionFacts: false, supported: true },
  },
  result: { metrics: [{ key: 'metric', label: 'Construct × Channel', construct: 'construct', channelKey: 'channel', direction: 'descriptive', role: 'primary', displayPrecision: 1, value: 0, range: { min: 0, max: 100 }, expectedResponses: [], answeredResponses: [], status: 'calculated' }], quality: { status: 'interpretable', flags: [] } },
}

describe('Situational export', () => {
  it('exports stored terminal metrics and never invents reference fields', () => {
    const payload = buildSituationalExportPayload(result)
    expect(payload.metrics[0]?.value).toBe(0)
    expect(payload.referencePolicy).toBe('NONE')
    expect(JSON.stringify(payload)).not.toMatch(/percentile|norm/i)
    expect(buildSituationalCsv(result)).toContain('metric')
  })
})



it('exports frozen governance and uses a marked legacy baseline without borrowing a current grade', () => {
  const historical = structuredClone(result)
  historical.instrument.scienceMaturity = 'RESEARCH_GRADE'
  expect(buildSituationalExportPayload(historical).scientificContext).toMatchObject({ scientificMaturity: 'PILOT', governanceRevision: null, provenance: 'LEGACY_MISSING' })
  historical.instrument.scientificContext = { scientificMaturity: 'RESEARCH_READY', governanceRevision: 3, evidenceDigest: 'd'.repeat(64), scope: { language: 'zh-CN', population: 'adults', use: 'research', claim: 'association' }, provenance: 'FROZEN' }
  expect(buildSituationalExportPayload(historical).scientificContext.scientificMaturity).toBe('RESEARCH_READY')
  expect(buildSituationalCsv(historical)).toContain('RESEARCH_READY')
  expect(buildSituationalCsv(historical)).not.toContain('RESEARCH_GRADE')
})


it('preserves explicit uncertainty and opportunity coverage without exporting raw research evidence', () => {
  const next = structuredClone(result)
  next.result!.model = { modelKey: 'EXPERT_KEY', modelVersion: '1', scoringVersion: 'expert-1' }
  Object.assign(next.result!.metrics[0]!, { estimate: 0, precision: { status: 'NOT_ESTIMATED', standardError: null, interval: null }, coverage: { numberOfOpportunities: 3, numberOfAnsweredOpportunities: 3, numberOfIndependentScenes: 1 }, maturity: 'PROVISIONAL' })
  expect(buildSituationalExportPayload(next)).toHaveProperty('model.modelVersion', '1')
  expect(buildSituationalCsv(next)).toContain('independentScenes')
  expect(buildSituationalCsv(next)).toContain('NOT_ESTIMATED')
  expect(JSON.stringify(buildSituationalExportPayload(next))).not.toMatch(/rawResponses|historyIdentity|RESPONSE_FIRST_COMMITTED/)
})
