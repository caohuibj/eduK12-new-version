// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { finalDraftStore, trainingCognitiveDraftKey } from '../services/persistence/finalDraftStore'
import { cleanupExpiredTrainingCognitiveDrafts, holdTrainingCognitiveDraft, trainingRetentionFromServer, type TrainingPersistenceDescriptor } from './training-cognitive-retention'
vi.mock('../services/persistence/finalDraftStore', async importOriginal => ({
  ...await importOriginal<typeof import('../services/persistence/finalDraftStore')>(),
  finalDraftStore: { listTrainingCognitiveDrafts: vi.fn(), expireTrainingCognitiveDraft: vi.fn() },
}))
const descriptor: TrainingPersistenceDescriptor = { snapshotHash: 'hash', attemptId: 'parent', attemptEpoch: 1,
  courseId: 'course', checkpoint: { enabled: true, ttlHours: 48 }, localCognitive: { enabled: true, ttlHours: 1 } }
const original = Object.getOwnPropertyDescriptor(navigator, 'locks')
const binding = () => trainingRetentionFromServer(descriptor, 'session', 1)!
function installLocks() {
  const held = new Map<string, number>()
  const request = vi.fn(async (name: string, options: LockOptions, callback: (lock: unknown) => unknown) => {
    if (options.signal?.aborted) throw new DOMException('aborted', 'AbortError')
    if (options.ifAvailable && held.has(name)) return callback(null)
    held.set(name, (held.get(name) ?? 0) + 1)
    try { return await callback({ name }) }
    finally { const count = held.get(name)! - 1; if (count) held.set(name, count); else held.delete(name) }
  })
  Object.defineProperty(navigator, 'locks', { configurable: true, value: { request } })
  return held
}
beforeEach(() => { localStorage.clear(); vi.resetAllMocks()
  vi.mocked(finalDraftStore.listTrainingCognitiveDrafts).mockResolvedValue({ draftKeys: [trainingCognitiveDraftKey(binding())], nextCursor: null })
})
afterEach(() => { if (original) Object.defineProperty(navigator, 'locks', original); else Reflect.deleteProperty(navigator, 'locks') })
describe('Training-only retention orchestration', () => {
  it('requires explicit independent local opt-in, trusted epochs, scope and frozen identity', () => {
    expect(trainingRetentionFromServer(undefined, 's', 1)).toBeUndefined()
    expect(trainingRetentionFromServer({ ...descriptor, localCognitive: null }, 's', 1)).toBeUndefined()
    expect(trainingRetentionFromServer(descriptor, 's', undefined)).toBeUndefined()
    expect(trainingRetentionFromServer({ ...descriptor, attemptEpoch: 0 }, 's', 1)).toBeUndefined()
    expect(trainingRetentionFromServer({ ...descriptor, snapshotHash: '' }, 's', 1)).toBeUndefined()
    for (const ttlHours of [0, 49, 1.5, NaN]) expect(trainingRetentionFromServer({ ...descriptor, localCognitive: { enabled: true, ttlHours } }, 's', 1)).toBeUndefined()
    expect(trainingRetentionFromServer(descriptor, 's', 1)?.ttlHours).toBe(1)
    expect(trainingRetentionFromServer({ ...descriptor, checkpoint: null, localCognitive: { enabled: true, ttlHours: 48 } }, 's', 1)?.ttlHours).toBe(48)
  })
  it('holds two active tabs, excludes cleanup, releases only when both tasks leave', async () => {
    const held = installLocks(), a = new AbortController(), b = new AbortController()
    const release = await holdTrainingCognitiveDraft(binding(), a.signal)
    await holdTrainingCognitiveDraft(binding(), b.signal)
    expect([...held.values()]).toEqual([2])
    expect(finalDraftStore.expireTrainingCognitiveDraft).toHaveBeenCalledTimes(1) // inactive entry only
    vi.mocked(finalDraftStore.expireTrainingCognitiveDraft).mockClear()
    await cleanupExpiredTrainingCognitiveDrafts()
    expect(finalDraftStore.expireTrainingCognitiveDraft).not.toHaveBeenCalled()
    release(); await vi.waitFor(() => expect([...held.values()]).toEqual([1]))
    await cleanupExpiredTrainingCognitiveDrafts()
    expect(finalDraftStore.expireTrainingCognitiveDraft).not.toHaveBeenCalled()
    b.abort(); await vi.waitFor(() => expect(held.size).toBe(0))
    await cleanupExpiredTrainingCognitiveDrafts()
    expect(finalDraftStore.expireTrainingCognitiveDraft).toHaveBeenCalledWith(trainingCognitiveDraftKey(binding()), expect.any(Number))
  })
  it('interleaves a cleanup with entry without expiring after the active lease is held', async () => {
    installLocks()
    const controller = new AbortController()
    const [release] = await Promise.all([
      holdTrainingCognitiveDraft(binding(), controller.signal),
      cleanupExpiredTrainingCognitiveDrafts(),
    ])
    vi.mocked(finalDraftStore.expireTrainingCognitiveDraft).mockClear()
    await cleanupExpiredTrainingCognitiveDrafts()
    expect(finalDraftStore.expireTrainingCognitiveDraft).not.toHaveBeenCalled()
    release()
  })

  it('skips cleanup without locks and rejects denied acquisition before draft recovery', async () => {
    Object.defineProperty(navigator, 'locks', { configurable: true, value: undefined })
    await holdTrainingCognitiveDraft(binding(), new AbortController().signal)
    await cleanupExpiredTrainingCognitiveDrafts()
    expect(finalDraftStore.listTrainingCognitiveDrafts).not.toHaveBeenCalled()
    Object.defineProperty(navigator, 'locks', { configurable: true, value: { request: vi.fn().mockRejectedValue(new Error('denied')) } })
    await expect(holdTrainingCognitiveDraft(binding(), new AbortController().signal)).rejects.toThrow('denied')
  })
  it('caps cleanup even if discovery returns an oversized page and retains on storage failure', async () => {
    installLocks()
    vi.mocked(finalDraftStore.listTrainingCognitiveDrafts).mockResolvedValue({ draftKeys: Array.from({ length: 110 }, (_, i) => `key${i}`), nextCursor: null })
    await cleanupExpiredTrainingCognitiveDrafts()
    expect(finalDraftStore.expireTrainingCognitiveDraft).toHaveBeenCalledTimes(100)
    vi.mocked(finalDraftStore.listTrainingCognitiveDrafts).mockRejectedValue(new Error('storage'))
    await expect(cleanupExpiredTrainingCognitiveDrafts()).resolves.toBeUndefined()
  })
})
