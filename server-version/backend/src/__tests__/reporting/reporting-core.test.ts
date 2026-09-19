import { describe, expect, it } from 'vitest'
import { buildReportingArtifact } from '../../modules/reporting/engine'
import { reportingAggregations, type7Quantile } from '../../modules/reporting/statistics'
import { validateReportingSpecDefinition } from '../../modules/reporting/spec'
import type {
  ReportingAnalysisSpecDefinitionV1,
  ReportingAnalysisSpecRecord,
  ReportingCohortSnapshotRecord,
  ReportingMaturity,
  ReportingResolvedExecutionV1,
  ReportingResultBatchV1,
} from '../../modules/reporting/types'

const hash = (char: string) => char.repeat(64).slice(0, 64)

const definition = (metricRules: ReportingAnalysisSpecDefinitionV1['metricRules']): ReportingAnalysisSpecDefinitionV1 => ({
  schemaVersion: 1,
  analysisKind: 'GROUP',
  engineKey: 'ORG_GROUP_V1',
  engineVersion: '1.0.0',
  privacyUnit: 'SUBJECT',
  selectionPolicy: 'UNIQUE_OR_REJECT',
  minimumCohortN: 3,
  minimumContributorN: 3,
  reportEvidenceCeiling: 'RESEARCH_GRADE',
  metricRules,
})

const rule = (metricId: string, minimumMetricN = 3): ReportingAnalysisSpecDefinitionV1['metricRules'][number] => ({
  metricId,
  sourceMetricKey: metricId,
  acceptedResultQuality: ['interpretable', 'limited'],
  acceptedMetricQuality: 'IGNORE_METRIC_QUALITY',
  aggregations: ['MEAN', 'MEDIAN', 'SD_POPULATION', 'SD_SAMPLE', 'MIN_MAX', 'QUARTILES', 'DISTRIBUTION'],
  missingnessRule: 'EXCLUDE',
  minimumMetricN,
  observationUnit: 'SUBJECT',
  selectionPolicy: 'UNIQUE_OR_REJECT',
})

const spec = (rules: ReportingAnalysisSpecDefinitionV1['metricRules']): ReportingAnalysisSpecRecord => ({
  id: 'spec-1',
  specKey: 'generic-group',
  version: 1,
  status: 'PUBLISHED',
  definition: definition(rules),
  specHash: hash('a'),
  createdByUserId: 'admin-1',
  createdAt: new Date('2026-01-01T00:00:00Z'),
  reviewedAt: new Date('2026-01-01T01:00:00Z'),
  publishedAt: new Date('2026-01-01T02:00:00Z'),
})

const cohort = (n: number, identity = hash('b')): ReportingCohortSnapshotRecord => ({
  id: `cohort-${identity[0]}`,
  organizationId: 'org-1',
  sourceRunId: 'run-1',
  sourceTrackId: 'track-1',
  selector: { kind: 'RUN_TRACK_SUBJECTS', runId: 'run-1', trackId: 'track-1' },
  members: Array.from({ length: n }, (_, index) => ({
    userId: `user-${index}`,
    membershipId: `member-${index}`,
    actorSnapshotId: `actor-${index}`,
    executionId: `execution-${index}`,
  })),
  eligibleN: n,
  cohortIdentityHash: identity,
  snapshotHash: hash('c'),
  generatedByUserId: 'admin-1',
  generatedAt: new Date('2026-01-02T00:00:00Z'),
})

const resolved = (
  index: number,
  metrics: Record<string, unknown>,
  maturity: ReportingMaturity | null = 'RESEARCH_READY',
  resultHash = hash(String((index % 9) + 1)),
): ReportingResolvedExecutionV1 => ({
  executionId: `execution-${index}`,
  subjectUserId: `user-${index}`,
  membershipId: `member-${index}`,
  trackId: 'track-1',
  canonicalResultHash: resultHash,
  metrics: Object.entries(metrics).map(([key, value]) => ({
    key,
    value,
    resultQuality: 'interpretable' as const,
    metricQuality: null,
  })),
  scientificMaturity: maturity,
  provenanceState: maturity ? 'FROZEN' : 'LEGACY_UNFROZEN',
  scientificProvenanceHash: maturity ? hash('d') : null,
})

const batch = (
  c: ReportingCohortSnapshotRecord,
  results: ReportingResolvedExecutionV1[],
  resourceMinimumN: number | null = null,
): ReportingResultBatchV1 => ({
  resourceFamily: 'BUNDLE',
  resourceKey: 'bundle-1',
  resourceVersion: '1.0.0',
  resourceMinimumN,
  resolved: results,
  unresolved: c.members
    .filter((member) => !results.some((result) => result.executionId === member.executionId))
    .map((member) => ({
      executionId: member.executionId,
      subjectUserId: member.userId,
      membershipId: member.membershipId,
      reason: 'NOT_COMPLETED' as const,
    })),
})

const build = (
  c: ReportingCohortSnapshotRecord,
  s: ReportingAnalysisSpecRecord,
  b: ReportingResultBatchV1,
) => buildReportingArtifact({
  artifactId: 'artifact-1',
  generatedByUserId: 'admin-1',
  generatedAt: '2026-01-03T00:00:00.000Z',
  spec: s,
  cohort: c,
  batch: b,
})

describe('PR3 deterministic reporting primitives', () => {
  it('uses Hyndman-Fan Type 7 quartiles and defined SD/null semantics', () => {
    expect(type7Quantile([1, 2, 3, 4], 0.25)).toBe(1.75)
    expect(type7Quantile([1, 2, 3, 4], 0.5)).toBe(2.5)
    const one = reportingAggregations({
      values: [5],
      aggregations: ['SD_POPULATION', 'SD_SAMPLE', 'QUARTILES'],
      distributionCellFloor: 1,
    })
    expect(one.sdPopulation).toBe(0)
    expect(one.sdSample).toBeNull()
    expect(one.quartiles).toEqual({ q1: 5, q2: 5, q3: 5 })
  })

  it('rejects PR4 analysis kinds at the PR3 spec boundary', () => {
    expect(() => validateReportingSpecDefinition({ ...definition([rule('score')]), analysisKind: 'LONGITUDINAL' }))
      .toThrowError(expect.objectContaining({ code: 'REPORT_SPEC_INVALID' }))
  })

  it('A-01 never coerces string/object/non-finite values into numeric observations', () => {
    const c = cohort(5)
    const results = [
      resolved(0, { score: 1 }),
      resolved(1, { score: 2 }),
      resolved(2, { score: '3' }),
      resolved(3, { score: { value: 4 } }),
      resolved(4, { score: 4 }),
    ]
    const artifact = build(c, spec([rule('score')]), batch(c, results))
    const metric = artifact.payload.projection.metrics!.score
    expect(metric).toMatchObject({ state: 'present', validN: 3, missingN: 2 })
    expect(metric.aggregations?.mean).toBeCloseTo(7 / 3)
  })

  it('A-02 rejects duplicate subject observations instead of inflating N', () => {
    const c = cohort(3)
    const duplicate = resolved(1, { score: 2 })
    duplicate.subjectUserId = 'user-0'
    duplicate.membershipId = 'member-0'
    expect(() => build(c, spec([rule('score')]), batch(c, [resolved(0, { score: 1 }), duplicate, resolved(2, { score: 3 })])))
      .toThrowError(expect.objectContaining({ code: 'REPORT_RESULT_INTEGRITY' }))
  })

  it('A-03 suppresses the whole projection when contributor floor is not met', () => {
    const c = cohort(20)
    const s = spec([rule('score', 5)])
    s.definition.minimumContributorN = 5
    const artifact = build(c, s, batch(c, [resolved(0, { score: 1 }), resolved(1, { score: 2 }), resolved(2, { score: 3 })]))
    expect(artifact.payload.projection).toMatchObject({ state: 'suppressed' })
    expect(artifact.payload.projection).not.toHaveProperty('eligibleN')
    expect(artifact.payload.projection).not.toHaveProperty('metrics')
  })

  it('A-04 keeps a sufficiently populated metric and suppresses a sparse one', () => {
    const c = cohort(20)
    const results = c.members.map((_, index) => resolved(index, {
      metricA: index + 1,
      metricB: index < 3 ? index + 1 : null,
    }))
    const artifact = build(c, spec([rule('metricA', 5), rule('metricB', 5)]), batch(c, results))
    expect(artifact.payload.projection.metrics?.metricA.state).toBe('present')
    expect(artifact.payload.projection.metrics?.metricB).toEqual({ state: 'suppressed' })
  })

  it('suppresses exact-value distribution cells below the effective metric floor', () => {
    const c = cohort(6)
    const results = c.members.map((_, index) => resolved(index, { score: index < 5 ? 1 : 2 }))
    const artifact = build(c, spec([rule('score', 3)]), batch(c, results))
    expect(artifact.payload.projection.metrics?.score.aggregations?.distribution).toEqual({ state: 'suppressed' })
  })

  it('A-05 changes analysis identity when the exact cohort identity changes at the same N', () => {
    const a = cohort(3, hash('b'))
    const b = cohort(3, hash('e'))
    const results = [resolved(0, { score: 1 }), resolved(1, { score: 2 }), resolved(2, { score: 3 })]
    expect(build(a, spec([rule('score')]), batch(a, results)).analysisIdentityHash)
      .not.toBe(build(b, spec([rule('score')]), batch(b, results)).analysisIdentityHash)
  })

  it('A-07 hashes result-to-execution associations rather than separately sorted hash sets', () => {
    const c = cohort(3)
    const first = [
      resolved(0, { score: 1 }, 'RESEARCH_READY', hash('1')),
      resolved(1, { score: 2 }, 'RESEARCH_READY', hash('2')),
      resolved(2, { score: 3 }, 'RESEARCH_READY', hash('3')),
    ]
    const swapped = [
      resolved(0, { score: 1 }, 'RESEARCH_READY', hash('2')),
      resolved(1, { score: 2 }, 'RESEARCH_READY', hash('1')),
      resolved(2, { score: 3 }, 'RESEARCH_READY', hash('3')),
    ]
    expect(build(c, spec([rule('score')]), batch(c, first)).analysisIdentityHash)
      .not.toBe(build(c, spec([rule('score')]), batch(c, swapped)).analysisIdentityHash)
  })

  it('M-02 reports the weakest frozen maturity for mixed inputs', () => {
    const c = cohort(3)
    const results = [
      resolved(0, { score: 1 }, 'RESEARCH_READY'),
      resolved(1, { score: 2 }, 'PILOT'),
      resolved(2, { score: 3 }, 'RESEARCH_READY'),
    ]
    const artifact = build(c, spec([rule('score')]), batch(c, results))
    expect(artifact.payload.projection.evidence).toEqual({ level: 'PILOT', limitations: ['MIXED_MATURITY_INPUTS'] })
  })

  it('M-03 caps legacy-unfrozen evidence at PILOT with an explicit limitation', () => {
    const c = cohort(3)
    const results = [resolved(0, { score: 1 }, null), resolved(1, { score: 2 }), resolved(2, { score: 3 })]
    const artifact = build(c, spec([rule('score')]), batch(c, results))
    expect(artifact.payload.projection.evidence?.level).toBe('PILOT')
    expect(artifact.payload.projection.evidence?.limitations).toContain('LEGACY_UNFROZEN_INPUT')
  })
})
