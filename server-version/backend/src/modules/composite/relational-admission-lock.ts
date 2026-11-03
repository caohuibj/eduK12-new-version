import type { Prisma } from '@prisma/client'

/** Relational admissions (Run executions, relational products, bundle children)
 * may admit different participants of the same Composite concurrently: the
 * published row is taken FOR SHARE so publication and content mutations (which
 * hold FOR UPDATE) still order after in-flight admissions, while participants
 * no longer serialize behind each other. One participant's replay check and
 * attemptNo allocation stay serialized by a participant-scoped advisory lock;
 * the (compositeAssessmentId, participantKey, attemptNo) unique constraint
 * remains the final backstop. */
export async function lockRelationalAdmission(
  tx: Pick<Prisma.TransactionClient, '$queryRaw'>,
  compositeId: string,
  participantKey: string,
): Promise<void> {
  await tx.$queryRaw`SELECT id FROM composite_assessments WHERE id=${compositeId} FOR SHARE`
  // A hash collision only causes conservative extra serialization. Prefix and
  // tuple encoding keep this lock namespace separate from other advisory uses.
  const identity = JSON.stringify(['relational-admission-v1', compositeId, participantKey])
  await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${identity}, 0))`
}
