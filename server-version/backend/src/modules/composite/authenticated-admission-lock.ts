import type { Prisma } from '@prisma/client'

type RawTx = Pick<Prisma.TransactionClient, '$queryRaw'>
// Row locks live until COMMIT/ROLLBACK, and an interactive transaction client
// is one object for its whole life, so a held SHARE lock is never re-taken.
const heldCompositeShareLocks = new WeakMap<object, Set<string>>()

/** Parent START and publication stop/archive serialize on this row. Taken at
 * most once per transaction; a repeat would not add any ordering. */
export async function lockCompositeAdmissionShare(tx: RawTx, compositeId: string): Promise<void> {
  let held = heldCompositeShareLocks.get(tx)
  if (held?.has(compositeId)) return
  await tx.$queryRaw`SELECT id FROM composite_assessments WHERE id=${compositeId} FOR SHARE`
  if (!held) heldCompositeShareLocks.set(tx, held = new Set())
  held.add(compositeId)
}

/** Readers may admit different students concurrently. Archive/publication
 * writes still wait for these readers; one student's attempt/quota decision
 * remains serialized across concurrent starts in this transaction. */
export async function lockAuthenticatedAdmission(
  tx: RawTx,
  compositeId: string,
  userId: string,
): Promise<void> {
  await lockCompositeAdmissionShare(tx, compositeId)
  // A hash collision only causes conservative extra serialization. Prefix and
  // tuple encoding keep this lock namespace separate from other advisory uses.
  const identity = JSON.stringify(['training-authenticated-admission-v1', compositeId, userId])
  await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${identity}, 0))`
}
