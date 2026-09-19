import { describe, expect, it } from 'vitest'
import {
  buildMatchedLongitudinalProjection,
  selectMatchedMetricCases,
  type ReportingMatchedLongitudinalSpecV1,
} from '../../modules/reporting/matched'
import type {
  ReportingMetricRuleV1,
  ReportingSeriesWaveRecordV1,
  ReportingWaveResolvedInputV1,
} from '../../modules/reporting/types'

const metricRule: ReportingMetricRuleV1 = {
  metricId: 'score',
  sourceMetricKey: 'score',
  acceptedResultQuality: ['interpretable'],
  acceptedMetricQuality: 'IGNORE_METRIC_QUALITY',
  aggregations: ['MEAN'],
  missingnessRule: 'EXCLUDE',
  minimumMetricN: 1,
  observationUnit: 'SUBJECT',
  selectionPolicy: 'UNIQUE_OR_REJECT',
}

const result = (executionId: string, userId: string, membershipId: string, value: number | null): ReportingWaveResolvedInputV1 => ({
  executionId,
  subjectUserId: userId,
  membershipId,
  canonicalResultHash: executionId.padEnd(64, 'a').slice(0, 64),
  metrics: value === null ? [] : [{ key: 'score', value, resultQuality: 'interpretable', metricQuality: null }],
  scientificMaturity: 'PILOT',
  provenanceState: 'FROZEN',
  scientificProvenanceHash: 'b'.repeat(64),
})

const wave = (input: {
  id: string
  ordinal: number
  version?: string
  resolved: ReportingWaveResolvedInputV1[]
  unresolved?: Array<{ executionId: string; subjectUserId: string; membershipId: string; reason: 'NOT_COMPLETED' }>
  minimumN?: number
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
    resource: { family: 'SCALE', key: 'wellbeing', version: input.version ?? '1.0.0', minimumN: input.minimumN ?? 1 },
    resolved: input.resolved,
    unresolved: input.unresolved ?? [],
  },
  inputIdentityHash: 'c'.repeat(64),
  snapshotHash: 'd'.repeat(64),
  createdByUserId: 'admin-1',
  createdAt: new Date('2026-01-01T00:00:00Z'),
})

const spec = (minimum = 1): ReportingMatchedLongitudinalSpecV1 => ({
  schemaVersion: 1,
  analysisKind: 'MATCHED_LONGITUDINAL',
  engineKey: 'ORG_MATCHED_LONGITUDINAL_V1',
  engineVersion: '1.0.0',
  privacyUnit: 'SUBJECT',
  selectionPolicy: 'UNIQUE_OR_REJECT',
  minimumCohortN: minimum,
  minimumContributorN: minimum,
  reportEvidenceCeiling: 'RESEARCH_READY',
  metricRules: [{ ...metricRule, minimumMetricN: minimum }],
  comparabilityRules: [{
    schemaVersion: 1,
    metricId: 'score',
    resourceFamily: 'SCALE',
    resourceKey: 'wellbeing',
    fromVersion: '1.0.0',
    toVersion: '1.0.0',
    level: 'EXACT',
    evidenceRef: 'spec:same-protocol',
    evidenceHash: 'e'.repeat(64),
  }],
})

describe('matched longitudinal reporting', () => {
  it('uses stable user identity across membership episodes and the same complete pair for both means and delta', () => {
    const w1 = wave({
      id: 'w1', ordinal: 1,
      resolved: [result('e1', 'u1', 'm1', 10), result('e2', 'u2', 'm2', 20)],
      unresolved: [{ executionId: 'e3', subjectUserId: 'u3', membershipId: 'm3', reason: 'NOT_COMPLETED' }],
    })
    const w2 = wave({
      id: 'w2', ordinal: 2,
      resolved: [result('e4', 'u1', 'm1-rejoined', 12), result('e5', 'u3', 'm3b', 30)],
      unresolved: [{ executionId: 'e6', subjectUserId: 'u2', membershipId: 'm2b', reason: 'NOT_COMPLETED' }],
    })
    const selected = selectMatchedMetricCases({ waves: [w1, w2], rule: metricRule })
    expect(selected.matchedEligibleN).toBe(3)
    expect(selected.cases).toHaveLength(1)
    expect(selected.cases[0]).toMatchObject({
      userId: 'u1',
      memberships: { w1: 'm1', w2: 'm1-rejoined' },
      values: { w1: 10, w2: 12 },
    })

    const projection = buildMatchedLongitudinalProjection({ waves: [w1, w2], spec: spec(1), mode: 'PAIRWISE' })
    expect(projection.matchedEligibleN).toBe(3)
    expect(projection.metrics?.score).toMatchObject({
      state: 'present',
      countKind: 'PAIRED_VALID',
      validCaseN: 1,
      waveMeans: [{ waveId: 'w1', waveKey: 'W1', mean: 10 }, { waveId: 'w2', waveKey: 'W2', mean: 12 }],
    })
    expect(projection.metrics?.score.comparisons?.[0].delta).toBe(2)
  })

  it('reapplies privacy to the paired set even when both Wave populations are large enough', () => {
    const w1 = wave({
      id: 'w1', ordinal: 1,
      resolved: [result('a1', 'u1', 'm1', 10), result('a2', 'u2', 'm2', 20), result('a3', 'u3', 'm3', 30), result('a4', 'u4', 'm4', 40), result('a5', 'u5', 'm5', 50)],
    })
    const w2 = wave({
      id: 'w2', ordinal: 2,
      resolved: [result('b1', 'u1', 'm1b', 12)],
      unresolved: [
        { executionId: 'b2', subjectUserId: 'u2', membershipId: 'm2b', reason: 'NOT_COMPLETED' },
        { executionId: 'b3', subjectUserId: 'u3', membershipId: 'm3b', reason: 'NOT_COMPLETED' },
        { executionId: 'b4', subjectUserId: 'u4', membershipId: 'm4b', reason: 'NOT_COMPLETED' },
        { executionId: 'b5', subjectUserId: 'u5', membershipId: 'm5b', reason: 'NOT_COMPLETED' },
      ],
    })
    const projection = buildMatchedLongitudinalProjection({ waves: [w1, w2], spec: spec(5), mode: 'PAIRWISE' })
    expect(projection.state).toBe('present')
    expect(projection.matchedEligibleN).toBe(5)
    expect(projection.metrics?.score).toEqual({ state: 'suppressed' })
  })

  it('distinguishes two-Wave pairwise selection from a three-Wave full complete case', () => {
    const w1 = wave({ id: 'w1', ordinal: 1, resolved: [result('a1', 'u1', 'm1', 1), result('a2', 'u2', 'm2', 2)] })
    const w2 = wave({ id: 'w2', ordinal: 2, resolved: [result('b1', 'u1', 'm1b', 2), result('b2', 'u2', 'm2b', 3)] })
    const w3 = wave({
      id: 'w3', ordinal: 3,
      resolved: [result('c1', 'u1', 'm1c', 4)],
      unresolved: [{ executionId: 'c2', subjectUserId: 'u2', membershipId: 'm2c', reason: 'NOT_COMPLETED' }],
    })
    expect(selectMatchedMetricCases({ waves: [w1, w2], rule: metricRule }).cases).toHaveLength(2)
    expect(selectMatchedMetricCases({ waves: [w1, w2, w3], rule: metricRule }).cases).toHaveLength(1)
    expect(buildMatchedLongitudinalProjection({ waves: [w1, w2, w3], spec: spec(1), mode: 'FULL_CASE' }).metrics?.score.countKind)
      .toBe('COMPLETE_CASE')
    expect(() => buildMatchedLongitudinalProjection({ waves: [w1, w2, w3], spec: spec(1), mode: 'PAIRWISE' })).toThrow()
  })

  it('rejects duplicate stable-user observations inside a single Wave instead of selecting a membership implicitly', () => {
    const w1 = wave({ id: 'w1', ordinal: 1, resolved: [result('a1', 'u1', 'm1', 1), result('a2', 'u1', 'm2', 2)] })
    const w2 = wave({ id: 'w2', ordinal: 2, resolved: [result('b1', 'u1', 'm3', 3)] })
    expect(() => selectMatchedMetricCases({ waves: [w1, w2], rule: metricRule })).toThrow()
  })
})
