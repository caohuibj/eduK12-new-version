import { afterEach, describe, expect, it, vi } from 'vitest'
import { createFinalDraftMeta, createFinalDraftStore, FinalDraftExpiredError, trainingCognitiveDraftKey, type TrainingDraftRetention } from '../finalDraftStore'

const start = 10000000
const binding = (sessionId = 'session', attemptEpoch = 1): TrainingDraftRetention => ({
  schemaVersion: 1, attemptId: 'parent', attemptEpoch, sessionId, sessionEpoch: 1,
  snapshotHash: 'frozen-policy', ttlHours: 1, lastWriteAt: start,
})
const meta = (id = 'session', epoch = 1) => {
  const b = binding(id, epoch)
  return createFinalDraftMeta({ draftKey: trainingCognitiveDraftKey(b), instrument: 'cognitive',
    attemptId: id, attemptEpoch: b.sessionEpoch, definitionHash: 'definition', contextSnapshotHash: null,
    deliveryMode: 'final_only', submissionId: 'submission', trainingRetention: b })
}
afterEach(() => vi.restoreAllMocks())
describe('Training cognitive draft retention', () => {
  it('atomically clears payloads, keeps identity tombstone, and rejects every stale mutation including ensure', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(start)
    const store = createFinalDraftStore(), draft = meta(), key = draft.draftKey
    await store.ensure(draft)
    await store.putAnswer({ draftKey: key, itemKey: 'q', value: 'secret', updatedAt: start })
    await store.putTrial({ draftKey: key, trialIndex: 0, payload: 'secret', createdAt: start })
    await store.setInstrumentMetadata(key, { privateValue: 'secret' })
    expect(await store.expireTrainingCognitiveDraft(key, start + 3600000)).toBe(false)
    expect(await store.expireTrainingCognitiveDraft(key, start + 3600001)).toBe(true)
    expect(await store.listAnswers(key)).toEqual([])
    expect(await store.listTrials(key)).toEqual([])
    expect((await store.get(key))?.instrumentMetadata).toBeUndefined()
    const tombstone = await store.get(key)
    expect(tombstone?.trainingRetention?.expiredAt).toBe(start + 3600001)
    const stale = [() => store.ensure(draft), () => store.update(draft),
      () => store.putAnswer({ draftKey: key, itemKey: 'q', value: 'late', updatedAt: start }),
      () => store.putTrial({ draftKey: key, trialIndex: 1, payload: 'late', createdAt: start }),
      () => store.setInstrumentMetadata(key, { late: true }), () => store.deleteAnswers(key, ['q']),
      () => store.setStatus(key, 'DRAFT'), () => store.sealForSubmission(key, () => ({ late: true }))]
    for (const write of stale) await expect(write()).rejects.toBeInstanceOf(FinalDraftExpiredError)
    const detached = (await store.get(key))!
    detached.trainingRetention!.expiredAt = undefined
    await store.delete(key)
    expect(await store.get(key)).toEqual(tombstone)
    await expect(store.ensure({ ...draft, trainingRetention: undefined })).rejects.toBeInstanceOf(FinalDraftExpiredError)
    await expect(store.ensure(meta('session', 2))).resolves.toMatchObject({ trainingRetention: { attemptEpoch: 2 } })
    expect(await store.get(key)).toEqual(tombstone)
  })

  it('keeps historical, Survey, other-product, malformed and missing-epoch records untouched', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(start)
    const store = createFinalDraftStore()
    const drafts = [
      { ...meta('old'), draftKey: 'cognitive:old', trainingRetention: undefined },
      { ...meta('survey'), draftKey: 'cognitive:survey', trainingRetention: undefined, surveyRetention: { schemaVersion: 1 as const, lastWriteAt: start } },
      { ...meta('scale'), instrument: 'scale' as const },
      { ...meta('missing'), trainingRetention: { ...binding('missing'), attemptEpoch: undefined as unknown as number } },
      { ...meta('invalid-ttl'), trainingRetention: { ...binding('invalid-ttl'), ttlHours: 49 } },
    ]
    for (const draft of drafts) {
      await store.ensure(draft)
      const before = await store.snapshot(draft.draftKey)
      expect(await store.expireTrainingCognitiveDraft(draft.draftKey, start + 999999999)).toBe(false)
      expect(await store.snapshot(draft.draftKey)).toEqual(before)
    }
    expect((await store.listTrainingCognitiveDrafts()).draftKeys).toEqual([])
  })

  it('protects seal, pending retry, conflict and malformed clocks without rebasing them', async () => {
    const clock = vi.spyOn(Date, 'now').mockReturnValue(start)
    const store = createFinalDraftStore()
    for (const status of ['SUBMITTING', 'RETRY_PENDING', 'CONFLICT', 'COMPLETED'] as const) {
      const draft = meta(status); await store.ensure(draft)
      await store.sealForSubmission(draft.draftKey, () => ({ exact: status }))
      await store.setStatus(draft.draftKey, status)
      expect(await store.expireTrainingCognitiveDraft(draft.draftKey, start + 999999999)).toBe(false)
    }
    for (const value of [0, -1, NaN, Infinity, start + 999999999]) {
      clock.mockReturnValue(value)
      const draft = meta(String(value)); await store.ensure(draft)
      expect(await store.expireTrainingCognitiveDraft(draft.draftKey, start + 3600001)).toBe(false)
      expect((await store.get(draft.draftKey))!.trainingRetention!.lastWriteAt).toBe(value)
    }
  })

  it('rechecks writes and seals after discovery and never renews unchanged reads/replays', async () => {
    const clock = vi.spyOn(Date, 'now').mockReturnValue(start)
    const store = createFinalDraftStore(), draft = meta(), key = draft.draftKey
    await store.ensure(draft)
    await store.putTrial({ draftKey: key, trialIndex: 0, payload: 'a', createdAt: start })
    clock.mockReturnValue(start + 3600001)
    await store.listTrainingCognitiveDrafts()
    await store.ensure(draft); await store.snapshot(key)
    await store.putTrial({ draftKey: key, trialIndex: 0, payload: 'a', createdAt: Date.now() })
    expect((await store.get(key))?.trainingRetention?.lastWriteAt).toBe(start)
    await store.putTrial({ draftKey: key, trialIndex: 1, payload: 'b', createdAt: Date.now() })
    expect(await store.expireTrainingCognitiveDraft(key, Date.now())).toBe(false)
    await store.sealForSubmission(key, () => ({ exact: true }))
    expect(await store.expireTrainingCognitiveDraft(key, Date.now() + 999999999)).toBe(false)
  })

  it('serializes competing expiry, stale writers and seals without resurrecting payloads', async () => {
    const clock = vi.spyOn(Date, 'now').mockReturnValue(start)
    const store = createFinalDraftStore(), draft = meta('race'), key = draft.draftKey
    await store.ensure(draft)
    clock.mockReturnValue(start + 3600001)
    const results = await Promise.allSettled([
      store.expireTrainingCognitiveDraft(key, Date.now()),
      store.putTrial({ draftKey: key, trialIndex: 0, payload: 'late', createdAt: Date.now() }),
      store.sealForSubmission(key, () => ({ late: true })), store.ensure(draft),
    ])
    expect(results.map(result => result.status)).toEqual(['fulfilled', 'rejected', 'rejected', 'rejected'])
    expect(await store.listTrials(key)).toEqual([])
    expect((await store.get(key))?.sealedSubmission).toBeUndefined()
  })

  it('bounds metadata scans to 100 and cannot retrofit policy onto a pre-existing record', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(start)
    const store = createFinalDraftStore()
    for (let i = 0; i < 105; i++) await store.ensure(meta(String(i).padStart(3, '0')))
    const page = await store.listTrainingCognitiveDrafts()
    expect(page.draftKeys).toHaveLength(100)
    expect((await store.listTrainingCognitiveDrafts(page.nextCursor)).draftKeys).toHaveLength(5)
    const draft = meta('old'); await store.ensure({ ...draft, trainingRetention: undefined })
    await expect(store.ensure(draft)).rejects.toThrow('不一致')
    await expect(store.update({ ...meta('000'), trainingRetention: { ...binding('000'), snapshotHash: 'changed' } })).rejects.toThrow('不一致')
  })
})
