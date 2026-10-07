import { prisma } from '../../config/database'

/** All composite participants receive feedback only after the whole attempt
 * completes. Standalone results retain their existing disclosure rules. */
export async function isCompositeParticipantFeedbackDeferred(
  attemptId: string | null | undefined,
  db: any = prisma,
): Promise<boolean> {
  if (!attemptId) return false
  const attempt = await db.compositeAssessmentAttempt.findUnique({
    where: { id: attemptId }, select: { status: true },
  })
  return !attempt || attempt.status !== 'COMPLETED'
}
