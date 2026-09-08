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

