import { describe, expect, it } from 'vitest'
import { buildRepeatedCohortProjection } from '../../modules/reporting/repeated'
import type {
  ReportingRepeatedCohortSpecV1,
  ReportingSeriesWaveRecordV1,
  ReportingWaveResolvedInputV1,
} from '../../modules/reporting/types'

const result = (executionId: string, userId: string, membershipId: string, value: number): ReportingWaveResolvedInputV1 => ({
  executionId,
  subjectUserId: userId,
  membershipId,
  canonicalResultHash: executionId.padEnd(64, 'a').slice(0, 64),
  metrics: [{ key: 'score', value, resultQuality: 'interpretable', metricQuality: null }],
  scientificMaturity: 'PILOT',
  provenanceState: 'FROZEN',
  scientificProvenanceHash: 'b'.repeat(64),
})

const wave = (input: {
  id: string
  ordinal: number
  version: string
  resolved: ReportingWaveResolvedInputV1[]
  unresolved?: Array<{ executionId: string; subjectUserId: string; membershipId: string; reason: 'NOT_COMPLETED' }>
}): ReportingSeriesWaveRecordV1 => ({
  id: input.id,
  organizationId: 'org-1',
  seriesId: 'series-1',
  waveKey: input.id.toUpperCase(),
  ordinal: input.ordinal,
  cohortSnapshotId: `cohort-${input.id}`,
  sourceRunId: `run-${input.id}`,
  sourceTrackId: `track-${input.id}`,
  inputManifest: {
    schemaVersion: 1,
    resource: { family: 'SCALE', key: 'wellbeing', version: input.version, minimumN: 2 },
    resolved: input.resolved,
    unresolved: input.unresolved ?? [],
  },
  inputIdentityHash: 'c'.repeat(64),
  snapshotHash: 'd'.repeat(64),
  createdByUserId: 'admin-1',
  createdAt: new Date('2026-01-01T00:00:00Z'),
})

const spec: ReportingRepeatedCohortSpecV1 = {
  schemaVersion: 1,
  analysisKind: 'REPEATED_COHORT',
  engineKey: 'ORG_REPEATED_COHORT_V1',
  engineVersion: '1.0.0',
  privacyUnit: 'SUBJECT',
  selectionPolicy: 'UNIQUE_OR_REJECT',
  minimumCohortN: 2,
  minimumContributorN: 2,
  reportEvidenceCeiling: 'RESEARCH_READY',
  metricRules: [{
    metricId: 'score',
    sourceMetricKey: 'score',
    acceptedResultQuality: ['interpretable'],
    acceptedMetricQuality: 'IGNORE_METRIC_QUALITY',
    aggregations: ['MEAN'],
    missingnessRule: 'EXCLUDE',
    minimumMetricN: 2,
    observationUnit: 'SUBJECT',
    selectionPolicy: 'UNIQUE_OR_REJECT',
  }],
  comparabilityRules: [{
    schemaVersion: 1,
    metricId: 'score',
    resourceFamily: 'SCALE',
    resourceKey: 'wellbeing',
    fromVersion: '1.0.0',
    toVersion: '1.1.0',
    level: 'LIMITED',
    evidenceRef: 'spec:limited-cross-version',
    evidenceHash: 'e'.repeat(64),
  }],
}

describe('repeated cohort reporting', () => {
  it('keeps Wave populations independent and reports descriptive limitations', () => {
    const projection = buildRepeatedCohortProjection({
      spec,
      waves: [
        wave({
          id: 'w1', ordinal: 1, version: '1.0.0',
          resolved: [result('e1', 'u1', 'm1', 10), result('e2', 'u2', 'm2', 20), result('e3', 'u3', 'm3', 30)],
        }),
        wave({
          id: 'w2', ordinal: 2, version: '1.1.0',
          resolved: [result('e4', 'u1', 'm1b', 12), result('e5', 'u4', 'm4', 40)],
          unresolved: [{ executionId: 'e6', subjectUserId: 'u5', membershipId: 'm5', reason: 'NOT_COMPLETED' }],
        }),
      ],
    })
    expect(projection.kind).toBe('REPEATED_COHORT')
    expect(projection.limitations).toEqual(['INDEPENDENT_WAVE_POPULATIONS', 'NOT_INDIVIDUAL_CHANGE'])
    expect(projection.waves[0].eligibleN).toBe(3)
    expect(projection.waves[1].eligibleN).toBe(3)
    expect(projection.waves[0].metrics?.score.aggregations?.mean).toBe(20)
    expect(projection.waves[1].metrics?.score.aggregations?.mean).toBe(26)
    expect(projection.comparisons[0].metrics.score.level).toBe('LIMITED')
    expect(projection.comparisons[0].metrics.score.allowedOperations).not.toContain('NUMERIC_DELTA')
  })

  it('suppresses a Wave without leaking its exact counts when the contributor floor fails', () => {
    const projection = buildRepeatedCohortProjection({
      spec,
      waves: [
        wave({ id: 'w1', ordinal: 1, version: '1.0.0', resolved: [result('e1', 'u1', 'm1', 10), result('e2', 'u2', 'm2', 20)] }),
        wave({
          id: 'w2', ordinal: 2, version: '1.1.0',
          resolved: [result('e3', 'u3', 'm3', 30)],
          unresolved: [{ executionId: 'e4', subjectUserId: 'u4', membershipId: 'm4', reason: 'NOT_COMPLETED' }],
        }),
      ],
    })
    expect(projection.waves[1]).toMatchObject({ state: 'suppressed' })
    expect(projection.waves[1].eligibleN).toBeUndefined()
    expect(projection.waves[1].resultContributorN).toBeUndefined()
    expect(projection.waves[1].metrics).toBeUndefined()
  })
})
