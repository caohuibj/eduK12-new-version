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

/**
 * Anonymous START admission: FOR SHARE on the composite row + a
 * per-participant advisory lock. Cross-participant START can proceed in
 * parallel (SHARE is compatible with SHARE); only the same participant's
 * repeat START serializes on the advisory lock, which is what keeps a
 * concurrent re-START from creating a duplicate attempt. Archive/close
 * still take FOR UPDATE and wait for SHARE readers.
 *
 * This replaces the exclusive FOR UPDATE that previously serialized every
 * START for the same questionnaire (measured 2026-11-12: the FOR UPDATE
 * roundtrip was 92% of the anonymous tx_wall, p50 4,034ms at 200 VU).
 *
 * Lock order (deadlock avoidance, consistent across all START paths):
 * composite SHARE first, then the per-participant advisory, then (inside
 * the study beforeAdmission) the study FOR SHARE and the participant
 * FOR SHARE. Close and withdrawal keep study/participant FOR UPDATE and
 * wait for these readers. A transaction never holds a study/participant
 * row lock without already holding the composite SHARE, so no lock-order
 * cycle exists. The advisory namespace ('anonymous-admission-v1') is distinct
 * from Training's ('training-authenticated-admission-v1') so the two
 * cannot collide.
 *
 * participantId is absent for the plain anonymous token path, which has no
 * participant identity: it takes only the SHARE. The token row's usedCount
 * CAS still enforces maxUses, and each call creates a fresh credential, so
 * there is no same-participant idempotency to protect there.
 */
export async function lockAnonymousAdmission(
  tx: RawTx,
  compositeId: string,
  participantId?: string,
): Promise<void> {
  await withStartNestedQueryRawLabel('lock_share', () => tx.$queryRawUnsafe(COMPOSITE_SHARE_SQL, compositeId))
  let held = heldCompositeShareLocks.get(tx)
  if (!held) heldCompositeShareLocks.set(tx, held = new Set())
  held.add(compositeId)
  if (!participantId) return
  // A hash collision only causes conservative extra serialization. Prefix and
  // tuple encoding keep this lock namespace separate from other advisory uses.
  const identity = JSON.stringify(['anonymous-admission-v1', compositeId, participantId])
  await withStartNestedQueryRawLabel('lock_advisory', () => tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${identity}, 0))`)
}
