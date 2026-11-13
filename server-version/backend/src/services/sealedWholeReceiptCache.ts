/** Process-local short-circuit for sealed whole-questionnaire receipts.
 *
 * The sealed receipt is durable in PostgreSQL, but a lost-ACK retry must not
 * pay a pre-gate header read on every normal first-time submit just to learn
 * that no receipt exists yet. When a whole/submit seals, the receipt identity
 * is remembered here (5-minute TTL, LRU-bounded). A later retry of the same
 * attempt replays from this cache with ZERO database queries; a first-time
 * submit finds no entry and enters the admission gate directly, where the gate
 * re-reads the header exactly once.
 *
 * A receipt sealed by another process (or before a restart) is not in this
 * cache; that retry falls through to the gate, whose in-gate replay still
 * returns the durable receipt. The cache is advisory only: it never creates
 * a receipt, and a miss is always safe.
 *
 * Ownership, epoch, slot-set, variant and payload checks on a cache hit mirror
 * the pre-gate replay. Consent is NOT re-asserted on an in-memory hit: the
 * receipt was already sealed (consent asserted at seal time) and the in-gate
 * replay likewise returns a sealed receipt without re-asserting consent.
 * A cache hit therefore re-acknowledges an already-accepted submission to
 * its same owner; it cannot create, alter or leak a receipt. */
export type SealedWholeReceipt = {
  submissionId: string
  payloadHash: string
  acceptedAt: Date
  timingSnapshotHash?: string
  userId: string | null
  recoveryTokenHash: string | null
  attemptEpoch: number
  frozenActiveSlotSetHash: string | null
  hasTrainingVariant: boolean
}

const MAX_SEALED_RECEIPTS = 256
const SEALED_RECEIPT_TTL_MS = 5 * 60 * 1000
const sealedWholeReceipts = new Map<string, { receipt: SealedWholeReceipt; expiresAt: number }>()
let nowForTest: (() => number) | null = null
const nowMs = () => (nowForTest ? nowForTest() : Date.now())

export const setSealedWholeReceiptNowForTest = (fn: (() => number) | null) => { nowForTest = fn }

export const rememberSealedWholeReceipt = (attemptId: string, receipt: SealedWholeReceipt, now = nowMs()) => {
  for (const [key, entry] of sealedWholeReceipts) if (entry.expiresAt <= now) sealedWholeReceipts.delete(key)
  if (!sealedWholeReceipts.has(attemptId) && sealedWholeReceipts.size >= MAX_SEALED_RECEIPTS) sealedWholeReceipts.delete(sealedWholeReceipts.keys().next().value!)
  sealedWholeReceipts.set(attemptId, { receipt, expiresAt: now + SEALED_RECEIPT_TTL_MS })
}

export const readSealedWholeReceipt = (attemptId: string, now = nowMs()): SealedWholeReceipt | null => {
  const entry = sealedWholeReceipts.get(attemptId)
  if (!entry) return null
  if (entry.expiresAt <= now) { sealedWholeReceipts.delete(attemptId); return null }
  return entry.receipt
}

export const clearSealedWholeReceiptCacheForTest = () => { sealedWholeReceipts.clear(); nowForTest = null }
