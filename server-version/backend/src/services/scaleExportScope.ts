import type { Prisma } from '@prisma/client'

/** An embedded result belongs to its delivery owner, never to the tool owner
 * merely because the tool was shared. Organization/relational results retain
 * their separate consent and cohort reporting routes. */
export const scaleExportScope = (
  scaleId: string,
  actor?: { userId: string },
): Prisma.AssessmentWhereInput => ({
  scaleId,
  ...(actor ? {
    OR: [
      { compositeAttemptId: null },
      { compositeAttempt: { is: {
        assignmentRef: null,
        compositeAssessment: { is: {
          createdBy: actor.userId,
          productKind: 'QUESTIONNAIRE',
          reportPackageKey: null,
        } },
      } } },
    ],
  } : { compositeAttemptId: null }),
})
