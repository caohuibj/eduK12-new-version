import { prisma } from '../../config/database'
import { createSqlRelationalAssignmentRepository } from './repository'

export type RelationalResultDispositionV1 =
  | 'NON_RELATIONAL'
  | 'INDIVIDUAL_ALLOWED'
  | 'COHORT_ONLY'

export const resolveRelationalCompositeResultDisposition = async (
  compositeAttemptId: string | null | undefined,
  db: any = prisma,
): Promise<RelationalResultDispositionV1> => {
  if (!compositeAttemptId) return 'NON_RELATIONAL'
  const attempt = await db.compositeAssessmentAttempt.findUnique({
    where: { id: compositeAttemptId },
    select: { assignmentRef: true },
  })
  if (!attempt?.assignmentRef) return 'NON_RELATIONAL'

  const assignment = await createSqlRelationalAssignmentRepository(db as any).findById(attempt.assignmentRef)
  // A dangling relational binding is an integrity failure. Fail closed for all
  // result projections rather than exposing a possibly private UNIT result.
  if (!assignment) return 'COHORT_ONLY'

  return (
    assignment.perspective === 'RELATIONAL_EXPERIENCE'
    || assignment.analysisMode === 'COHORT_AGGREGATE'
  )
    ? 'COHORT_ONLY'
    : 'INDIVIDUAL_ALLOWED'
}

export const isRelationalCohortOnlyCompositeAttempt = async (
  compositeAttemptId: string | null | undefined,
  db: any = prisma,
): Promise<boolean> => (
  await resolveRelationalCompositeResultDisposition(compositeAttemptId, db)
) === 'COHORT_ONLY'

export const projectRelationalUnitFinalResponse = async <T extends Record<string, any>>(
  compositeAttemptId: string | null | undefined,
  data: T,
  db: any = prisma,
): Promise<T | {
  submissionId?: string
  payloadHash?: string
  replayed: boolean
  completed: true
}> => {
  if (!(await isRelationalCohortOnlyCompositeAttempt(compositeAttemptId, db))) return data
  return {
    ...(typeof data.submissionId === 'string' ? { submissionId: data.submissionId } : {}),
    ...(typeof data.payloadHash === 'string' ? { payloadHash: data.payloadHash } : {}),
    replayed: Boolean(data.replayed),
    completed: true,
  }
}
