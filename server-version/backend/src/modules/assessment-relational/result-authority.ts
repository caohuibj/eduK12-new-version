import {
  disclosureFromRelationalDisposition,
  type RelationalDisclosureDispositionV1,
} from '../assessment-policy/disclosure'
import { prisma } from '../../config/database'

export type RelationalResultDispositionV1 = RelationalDisclosureDispositionV1

type FrozenRelationalAttemptIdentity = {
  assignmentRef: string | null
  respondentType: string | null
}

/**
 * RA-01 freezes the legacy respondentType bridge into the Composite attempt:
 * PARENT/TEACHER are observer-report identities, while Student->Teacher keeps
 * respondentType null and is authorized only through its relational assignment.
 *
 * Result privacy must not introduce relationship/roster reads on FINAL. The
 * identity is a conservative first filter; observer reads also verify frozen assignment policy. A future
 * relational mode that also uses a null respondentType fails closed as
 * aggregate-only until it declares an explicit result-visibility contract.
 */
export const dispositionFromFrozenRelationalAttemptIdentity = (
  identity: FrozenRelationalAttemptIdentity | null | undefined,
): RelationalResultDispositionV1 => {
  if (!identity?.assignmentRef) return 'NON_RELATIONAL'
  return identity.respondentType === 'PARENT' || identity.respondentType === 'TEACHER'
    ? 'INDIVIDUAL_ALLOWED'
    : 'COHORT_ONLY'
}

export const resolveRelationalCompositeResultDisposition = async (
  compositeAttemptId: string | null | undefined,
  db: any = prisma,
): Promise<RelationalResultDispositionV1> => {
  if (!compositeAttemptId) return 'NON_RELATIONAL'
  const attempt = await db.compositeAssessmentAttempt.findUnique({
    where: { id: compositeAttemptId },
    select: { assignmentRef: true, respondentType: true },
  })
  // Missing parent is an integrity failure for an embedded UNIT. Fail closed.
  if (!attempt) return 'COHORT_ONLY'
  const disposition = dispositionFromFrozenRelationalAttemptIdentity(attempt)
  if (disposition !== 'INDIVIDUAL_ALLOWED') return disposition
  // Observer identity alone is insufficient: an Organization resource may
  // freeze aggregate-only visibility for Parent/Teacher respondents as well.
  // Read only immutable assignment policy; never consult live roster or rescore.
  const policies = await db.$queryRaw`
    SELECT perspective, analysis_mode AS "analysisMode"
    FROM relational_assessment_assignments WHERE id=${attempt.assignmentRef}
  `
  const policy = policies[0]
  if (!policy || policy.perspective === 'RELATIONAL_EXPERIENCE' || policy.analysisMode !== 'INDIVIDUAL_ONLY') return 'COHORT_ONLY'
  return 'INDIVIDUAL_ALLOWED'
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
  const disposition = await resolveRelationalCompositeResultDisposition(compositeAttemptId, db)
  const disclosure = disclosureFromRelationalDisposition({
    disposition,
    audience: 'RESPONDENT',
    policyKey: 'frozen-relational-final-v1',
  })
  if (disclosure.mode !== 'COMPLETION_ONLY') return data
  return {
    ...(typeof data.submissionId === 'string' ? { submissionId: data.submissionId } : {}),
    ...(typeof data.payloadHash === 'string' ? { payloadHash: data.payloadHash } : {}),
    replayed: Boolean(data.replayed),
    completed: true,
  }
}
