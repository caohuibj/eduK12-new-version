import { withStartNestedQueryRawLabel } from '../../services/runtimeObservability'
import type { Prisma } from '@prisma/client'

type RawTx = Pick<Prisma.TransactionClient, '$queryRaw' | '$queryRawUnsafe'>
const COMPOSITE_SHARE_SQL = 'SELECT "id" FROM "composite_assessments" WHERE "id" = $1 FOR SHARE'
// Marks are written only by lockAuthenticatedAdmission, whose caller passes the
// client of a fresh prisma.$transaction. Row locks live until COMMIT/ROLLBACK and
// that client is one object for the whole transaction, so a marked client
// already holds the SHARE lock. Unmarked clients (including any non-tx client)
// always take the lock.
const heldCompositeShareLocks = new WeakMap<object, Set<string>>()

/** Parent START and publication stop/archive serialize on this row. Skips the
 * statement only when lockAuthenticatedAdmission already took it on this tx. */
export async function lockCompositeAdmissionShare(tx: RawTx, compositeId: string): Promise<void> {
  if (heldCompositeShareLocks.get(tx)?.has(compositeId)) return
  await withStartNestedQueryRawLabel('lock_share', () => tx.$queryRawUnsafe(COMPOSITE_SHARE_SQL, compositeId))
}

/** Readers may admit different students concurrently. Archive/publication
 * writes still wait for these readers; one student's attempt/quota decision
 * remains serialized across concurrent starts in this transaction. */
export async function lockAuthenticatedAdmission(
  tx: RawTx,
  compositeId: string,
  userId: string,
): Promise<void> {
  await withStartNestedQueryRawLabel('lock_share', () => tx.$queryRawUnsafe(COMPOSITE_SHARE_SQL, compositeId))
  let held = heldCompositeShareLocks.get(tx)
  if (!held) heldCompositeShareLocks.set(tx, held = new Set())
  held.add(compositeId)
  // A hash collision only causes conservative extra serialization. Prefix and
  // tuple encoding keep this lock namespace separate from other advisory uses.
  const identity = JSON.stringify(['training-authenticated-admission-v1', compositeId, userId])
  await withStartNestedQueryRawLabel('lock_advisory', () => tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${identity}, 0))`)
}
