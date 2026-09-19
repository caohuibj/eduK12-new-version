import { describe, expect, it } from 'vitest'
import { buildReportingArtifact } from '../../modules/reporting/engine'
import type {
  ReportingAnalysisSpecRecord,
  ReportingCohortSnapshotRecord,
  ReportingResolvedExecutionV1,
  ReportingResultBatchV1,
} from '../../modules/reporting/types'

const hash = (char: string) => char.repeat(64).slice(0, 64)

const cohort: ReportingCohortSnapshotRecord = {
  id: 'cohort-privacy',
  organizationId: 'org-1',
  sourceRunId: 'run-1',
  sourceTrackId: 'track-1',
  selector: { kind: 'RUN_TRACK_SUBJECTS', runId: 'run-1', trackId: 'track-1' },
  members: Array.from({ length: 5 }, (_, index) => ({
    userId: `user-${index}`,
    membershipId: `membership-${index}`,
    actorSnapshotId: `actor-${index}`,
    executionId: `execution-${index}`,
  })),
  eligibleN: 5,
  cohortIdentityHash: hash('b'),
  snapshotHash: hash('c'),
  generatedByUserId: 'admin-1',
  generatedAt: new Date('2026-09-19T00:00:00.000Z'),
}

const spec: ReportingAnalysisSpecRecord = {
  id: 'spec-1',
  specKey: 'privacy-floor',
  version: 1,
  status: 'PUBLISHED',
  definition: {
    schemaVersion: 1,
    analysisKind: 'GROUP',
    engineKey: 'ORG_GROUP_V1',
    engineVersion: '1.0.0',
    privacyUnit: 'SUBJECT',
    selectionPolicy: 'UNIQUE_OR_REJECT',
    minimumCohortN: 3,
    minimumContributorN: 3,
    reportEvidenceCeiling: 'RESEARCH_GRADE',
    metricRules: [{
      metricId: 'score',
      sourceMetricKey: 'score',
      acceptedResultQuality: ['interpretable'],
      acceptedMetricQuality: 'IGNORE_METRIC_QUALITY',
      aggregations: ['MEAN'],
      missingnessRule: 'EXCLUDE',
      minimumMetricN: 3,
      observationUnit: 'SUBJECT',
      selectionPolicy: 'UNIQUE_OR_REJECT',
    }],
  },
  specHash: hash('a'),
  createdByUserId: 'admin-1',
  createdAt: new Date('2026-09-19T00:00:00.000Z'),
  reviewedAt: new Date('2026-09-19T00:01:00.000Z'),
  publishedAt: new Date('2026-09-19T00:02:00.000Z'),
}

const resolved: ReportingResolvedExecutionV1[] = cohort.members.map((member, index) => ({
  executionId: member.executionId,
  subjectUserId: member.userId,
  membershipId: member.membershipId,
  trackId: 'track-1',
  canonicalResultHash: hash(String(index + 1)),
  metrics: [{ key: 'score', value: index + 1, resultQuality: 'interpretable', metricQuality: null }],
  scientificMaturity: 'RESEARCH_READY',
  provenanceState: 'FROZEN',
  scientificProvenanceHash: hash('d'),
}))

const batch = (effectiveMinimumN: number): ReportingResultBatchV1 => ({
  resourceFamily: 'BUNDLE',
  resourceKey: 'bundle-1',
  resourceVersion: '1.0.0',
  resourceMinimumN: effectiveMinimumN,
  resolved,
  unresolved: [],
})

const build = (effectiveMinimumN: number) => buildReportingArtifact({
  artifactId: 'artifact-1',
  generatedByUserId: 'admin-1',
  generatedAt: '2026-09-19T00:03:00.000Z',
  spec,
  cohort,
  batch: batch(effectiveMinimumN),
})

describe('PR3 effective privacy floor identity', () => {
  it('prevents reuse across different effective floors and suppresses when the stricter floor is unmet', () => {
    const floor3 = build(3)
    const floor4 = build(4)
    const floor6 = build(6)

    expect(floor3.payload.projection.state).toBe('present')
    expect(floor4.payload.projection.state).toBe('present')
    expect(floor6.payload.projection.state).toBe('suppressed')

    expect(floor4.analysisIdentityHash).not.toBe(floor3.analysisIdentityHash)
    expect(floor6.analysisIdentityHash).not.toBe(floor3.analysisIdentityHash)
  })
})
