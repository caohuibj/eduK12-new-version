import type { Prisma } from '@prisma/client'

/** Readers may admit different students concurrently. Archive/publication
 * writes still wait for these readers; one student's attempt/quota decision
 * remains serialized across concurrent starts in this transaction. */
export async function lockAuthenticatedAdmission(
  tx: Pick<Prisma.TransactionClient, '$queryRaw'>,
  compositeId: string,
  userId: string,
): Promise<void> {
  await tx.$queryRaw`SELECT id FROM composite_assessments WHERE id=${compositeId} FOR SHARE`
  // A hash collision only causes conservative extra serialization. Prefix and
  // tuple encoding keep this lock namespace separate from other advisory uses.
  const identity = JSON.stringify(['training-authenticated-admission-v1', compositeId, userId])
  await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${identity}, 0))`
}
