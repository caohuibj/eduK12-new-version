import { canonicalHash } from '../assessment-runtime/canonical'
import { parseStoredCanonicalUnitResult } from '../assessment-runtime/persistence'
import {
  createRelationalCohortAnalysisService,
  validateRelationalCohortPolicy,
  type RelationalCohortAnalysisPolicyV1,
  type RelationalCohortAnalysisSnapshotV1,
  type RelationalCanonicalResultSourceV1,
} from './analysis'
import { createSqlRelationalAnalysisRepository } from './analysis-repository'
import { relationalFail } from './errors'
import { createSqlRelationalAssignmentRepository } from './repository'
import type { RelationalAssignmentRecordV1 } from './types'

const createCompositeCanonicalResultSource = (
  db: any,
  metricKeys: readonly string[],
): RelationalCanonicalResultSourceV1 => {
  const allowed = new Set(metricKeys)
  return {
    async loadForAssignment(assignment) {
      const attempt = await db.compositeAssessmentAttempt.findFirst({
        where: {
          assignmentRef: assignment.assignmentId,
          status: 'COMPLETED',
        },
        orderBy: { completedAt: 'desc' },
        select: {
          id: true,
          userId: true,
          subjectUserId: true,
          respondentUserId: true,
          episodeId: true,
          assignmentRef: true,
          attemptEpoch: true,
        },
      })
      if (!attempt) return null
      if (
        attempt.userId !== assignment.respondentUserId
        || attempt.subjectUserId !== assignment.subjectUserId
        || attempt.respondentUserId !== assignment.respondentUserId
        || attempt.episodeId !== assignment.episodeId
        || attempt.assignmentRef !== assignment.assignmentId
      ) {
        relationalFail('RELATIONAL_RUNTIME_BINDING', 'completed runtime attempt does not match the relational cohort assignment')
      }

      const rows = await db.assessmentUnitSnapshot.findMany({
        where: {
          compositeAttemptId: attempt.id,
          attemptEpoch: attempt.attemptEpoch,
          terminalState: 'COMPLETED',
          payloadKind: 'UNIT_RESULT',
        },
        orderBy: { slotKey: 'asc' },
        select: {
          slotKey: true,
          canonicalResultEncrypted: true,
        },
      })
      if (rows.length === 0) return null

      const metrics: Record<string, number | null> = Object.fromEntries(
        metricKeys.map((key) => [key, null]),
      )
      const seen = new Set<string>()
      const unitResults: Array<{ slotKey: string; resultHash: string }> = []
      for (const row of rows) {
        if (!row.canonicalResultEncrypted) {
          relationalFail('RELATIONAL_RUNTIME_BINDING', 'completed UNIT_RESULT snapshot is missing its canonical result')
        }
        let envelope
        try {
          envelope = parseStoredCanonicalUnitResult(row.canonicalResultEncrypted)
        } catch {
          return relationalFail('RELATIONAL_RUNTIME_BINDING', 'stored canonical unit result is invalid')
        }
        unitResults.push({ slotKey: row.slotKey, resultHash: envelope.resultHash })
        for (const metric of envelope.core.metrics) {
          if (!allowed.has(metric.key)) continue
          if (seen.has(metric.key)) {
            relationalFail('RELATIONAL_ANALYSIS_METRIC', `cohort metric ${metric.key} is ambiguous across multiple runtime units`)
          }
          seen.add(metric.key)
          if (envelope.core.quality.status === 'invalid') {
            metrics[metric.key] = null
            continue
          }
          if (metric.value !== null && (typeof metric.value !== 'number' || !Number.isFinite(metric.value))) {
            relationalFail('RELATIONAL_ANALYSIS_METRIC', `cohort metric ${metric.key} must be a finite canonical number or null`)
          }
          metrics[metric.key] = metric.value as number | null
        }
      }

      return {
        canonicalResultHash: canonicalHash({
          schema: 'RelationalCompositeCanonicalProjectionV1',
          assignmentId: assignment.assignmentId,
          attemptId: attempt.id,
          unitResults,
        }),
        metrics,
      }
    },
  }
}

export const createRelationalProductCohortMaterializer = (db: any) => ({
  async materialize(input: {
    assignments: RelationalAssignmentRecordV1[]
    policy: RelationalCohortAnalysisPolicyV1
  }): Promise<RelationalCohortAnalysisSnapshotV1> {
    if (input.assignments.length === 0) {
      return relationalFail('RELATIONAL_COHORT_ASSIGNMENT', 'cohort materialization requires completed assignments')
    }
    const policy = validateRelationalCohortPolicy(input.policy)
    const first = input.assignments[0]
    const courseId = first.relationshipSnapshot.courseId
      || relationalFail('RELATIONAL_COHORT_SCOPE', 'cohort assignment is missing frozen courseId')

    return db.$transaction(async (tx: any) => {
      await tx.$queryRawUnsafe(
        'SELECT id FROM assessment_episodes WHERE id = $1 FOR UPDATE',
        first.episodeId,
      )
      const analysisRepository = createSqlRelationalAnalysisRepository(tx as any)
      const scope = {
        subjectUserId: first.subjectUserId,
        courseId,
        episodeId: first.episodeId,
        resourceKind: first.resourceKind,
        resourceKey: first.resourceKey,
        resourceVersion: first.resourceVersion,
        applicabilityHash: first.applicabilityHash,
      }
      const existing = await analysisRepository.latestCohort(scope)
      if (existing && existing.respondentCount >= input.assignments.length) return existing

      const assignments = createSqlRelationalAssignmentRepository(tx as any)
      const analysis = createRelationalCohortAnalysisService({
        assignments,
        canonicalResults: createCompositeCanonicalResultSource(tx, policy.metricKeys),
      })
      const snapshot = await analysis.build({
        assignmentIds: input.assignments.map((assignment) => assignment.assignmentId),
        policy,
        createdAt: new Date().toISOString(),
      })
      await analysisRepository.saveCohort(snapshot)
      return snapshot
    })
  },
})
