import { finalDraftStore, trainingCognitiveDraftKey, type TrainingDraftRetention } from '../services/persistence/finalDraftStore'

/** Server-issued frozen attempt metadata, common to authenticated and public runners.
 * A client cannot establish authorization by manufacturing these values. Server
 * FINAL/restart authorization remains independently authoritative. */
export interface TrainingPersistenceDescriptor {
  snapshotHash: string
  attemptId: string
  attemptEpoch: number
  courseId: string
  checkpoint: { enabled: true; ttlHours: number } | null
  localCognitive: { enabled: true; ttlHours: number } | null
}

export function trainingRetentionFromServer(
  descriptor: TrainingPersistenceDescriptor | undefined,
  sessionId: string,
  sessionEpoch: number | undefined,
): TrainingDraftRetention | undefined {
  const policy = descriptor?.localCognitive
  if (!descriptor || policy?.enabled !== true || !Number.isInteger(policy.ttlHours)
    || policy.ttlHours < 1 || policy.ttlHours > 48
    || typeof descriptor.snapshotHash !== 'string' || !descriptor.snapshotHash
    || typeof descriptor.attemptId !== 'string' || !descriptor.attemptId
    || typeof descriptor.courseId !== 'string' || !descriptor.courseId
    || !Number.isSafeInteger(descriptor.attemptEpoch) || descriptor.attemptEpoch < 1
    || typeof sessionId !== 'string' || !sessionId
    || !Number.isSafeInteger(sessionEpoch) || sessionEpoch! < 1) return undefined
  return { schemaVersion: 1, attemptId: descriptor.attemptId, attemptEpoch: descriptor.attemptEpoch,
    sessionId, sessionEpoch: sessionEpoch!, snapshotHash: descriptor.snapshotHash,
    ttlHours: policy.ttlHours, lastWriteAt: Date.now() }
}

const cursorKey = 'training:v1:cognitive-retention-cursor'
const lockName = (draftKey: string) => `training:cognitive-draft:${draftKey}`
const locks = () => typeof navigator !== 'undefined' ? navigator.locks : undefined

/** Acquire before ensure/recovery and hold until the task unmounts. Supported
 * but denied locks fail closed; unsupported locks disable cleanup altogether. */
export async function holdTrainingCognitiveDraft(binding: TrainingDraftRetention, signal: AbortSignal): Promise<() => void> {
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
  const manager = locks()
  if (!manager) return () => undefined
  // Reopening an inactive, overdue draft is not an effective write. Check this
  // exact identity under an exclusive lease before becoming an active reader.
  // A peer already doing the task holds shared mode, so this never interrupts it.
  const key = trainingCognitiveDraftKey(binding)
  await manager.request(lockName(key), { mode: 'exclusive', ifAvailable: true }, async lock => {
    if (lock) await finalDraftStore.expireTrainingCognitiveDraft(key, Date.now())
  })
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
  return new Promise((resolve, reject) => {
    let release: () => void = () => undefined
    const held = new Promise<void>(done => { release = done })
    void Promise.resolve().then(() => manager.request(lockName(trainingCognitiveDraftKey(binding)), { mode: 'shared', signal }, async () => {
      if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
      const stop = () => { signal.removeEventListener('abort', stop); release() }
      signal.addEventListener('abort', stop, { once: true })
      resolve(stop)
      await held
    })).catch(reject)
  })
}

/** Training-entry-only, bounded best effort. Never call from a trial/input timer.
 * No background timers, historical ownership inference, or Survey registry use. */
export async function cleanupExpiredTrainingCognitiveDrafts(): Promise<void> {
  try {
    const manager = locks()
    if (!manager) return
    const saved = localStorage.getItem(cursorKey)
    const page = await finalDraftStore.listTrainingCognitiveDrafts(saved && saved.length <= 2048 ? saved : null)
    for (const key of page.draftKeys.slice(0, 100)) {
      try {
        await manager.request(lockName(key), { mode: 'exclusive', ifAvailable: true }, async lock => {
          if (lock) await finalDraftStore.expireTrainingCognitiveDraft(key, Date.now())
        })
      } catch { /* Retain on lock/storage failure. */ }
    }
    if (page.nextCursor) localStorage.setItem(cursorKey, page.nextCursor)
    else localStorage.removeItem(cursorKey)
  } catch { /* Optional cleanup never blocks entry. */ }
}
