import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createFinalDraftMeta, createFinalDraftStore, FinalDraftExpiredError,
  FinalDraftIdentityConflictError, FinalDraftNotWritableError,
  type FinalDraftAnswer, type FinalDraftInstrument,
} from '../finalDraftStore'

const setup = async (instrument: FinalDraftInstrument = 'scale') => {
  const store = createFinalDraftStore()
  const meta = createFinalDraftMeta({ draftKey: `replacement:${crypto.randomUUID()}`, instrument,
    attemptId: 'attempt', attemptEpoch: 2, definitionHash: 'definition', contextSnapshotHash: 'context',
    instrumentKey: 'key', instrumentVersion: 'version', compiledRuntimeHash: 'runtime',
    deliveryMode: 'final_only', submissionId: 'submission',
    instrumentMetadata: { provenance: 'keep', trainingScaleTiming: { items: { old: 1 } } } })
  await store.ensure(meta)
  const old: FinalDraftAnswer[] = [
    { draftKey: meta.draftKey, itemKey: 'old-only', value: 'preserve on failure', updatedAt: 1 },
    { draftKey: meta.draftKey, itemKey: 'shared', value: 'old', updatedAt: 1 },
  ]
  for (const answer of old) await store.putAnswer(answer)
  const next = [
    { draftKey: meta.draftKey, itemKey: 'new-only', value: 'restored', updatedAt: 2 },
    { draftKey: meta.draftKey, itemKey: 'shared', value: 'new', updatedAt: 2 },
  ]
  const timing = { trainingScaleTiming: { items: { restored: 2 } } }
  return { store, meta, old, next, timing }
}
afterEach(() => vi.restoreAllMocks())

describe('atomic answer and timing replacement', () => {
  it.each(['scale', 'composite-form-section', 'questionnaire-form-section', 'composite-whole', 'situational'] as const)('replaces the entire %s answer set and timing together', async instrument => {
    const { store, meta, next, timing } = await setup(instrument)
    const other = { ...meta, draftKey: `${meta.draftKey}:other` }
    await store.ensure(other)
    await store.putAnswer({ draftKey: other.draftKey, itemKey: 'q', value: 'unrelated', updatedAt: 1 })
    await store.putTrial({ draftKey: meta.draftKey, trialIndex: 0, payload: 'untouched', createdAt: 1 })
    await store.replaceAnswers(meta, next, timing)
    expect(await store.listAnswers(meta.draftKey)).toEqual(next)
    expect((await store.get(meta.draftKey))?.instrumentMetadata).toEqual({ provenance: 'keep', ...timing })
    expect((await store.listAnswers(other.draftKey))[0].value).toBe('unrelated')
    expect((await store.listTrials(meta.draftKey))[0].payload).toBe('untouched')
  })

  it('validates all rows and clones all timing before changing old or new-only keys', async () => {
    const { store, meta, old, next, timing } = await setup()
    for (const invalid of [
      [...next, { ...next[0], draftKey: 'wrong' }],
      [...next, { ...next[0] }],
      [...next, { ...next[0], itemKey: '' }],
      [...next, { ...next[0], itemKey: 'uncloneable', value: () => undefined }],
    ]) {
      await expect(store.replaceAnswers(meta, invalid, timing)).rejects.toThrow()
      expect(await store.listAnswers(meta.draftKey)).toEqual(old)
      expect((await store.get(meta.draftKey))?.instrumentMetadata).toEqual(meta.instrumentMetadata)
    }
    await expect(store.replaceAnswers(meta, next, { timing: () => undefined })).rejects.toThrow()
    expect(await store.listAnswers(meta.draftKey)).toEqual(old)
    expect((await store.get(meta.draftKey))?.instrumentMetadata).toEqual(meta.instrumentMetadata)
  })

  it('rechecks all frozen identity fields and the submission identity', async () => {
    const { store, meta, old, next, timing } = await setup()
    for (const field of ['attemptId', 'attemptEpoch', 'definitionHash', 'contextSnapshotHash', 'instrumentKey', 'instrumentVersion', 'compiledRuntimeHash', 'instrument', 'submissionId'] as const) {
      const stale = { ...meta, [field]: field === 'attemptEpoch' ? 3 : field === 'instrument' ? 'composite-whole' : 'stale' }
      await expect(store.replaceAnswers(stale, next, timing)).rejects.toBeInstanceOf(FinalDraftIdentityConflictError)
      expect(await store.listAnswers(meta.draftKey)).toEqual(old)
    }
  })

  it('rejects expired metadata without changing answers or timing', async () => {
    const { store, meta, old, next, timing } = await setup()
    const expired = { ...meta, draftKey: `${meta.draftKey}:expired`, trainingRetention: { schemaVersion: 1 as const, attemptId: 'attempt', attemptEpoch: 2,
      sessionId: 'attempt', sessionEpoch: 2, snapshotHash: 'snapshot', ttlHours: 1, lastWriteAt: 1, expiredAt: 2 } }
    await store.ensure(expired)
    await expect(store.replaceAnswers(expired, next.map(row => ({ ...row, draftKey: expired.draftKey })), timing)).rejects.toBeInstanceOf(FinalDraftExpiredError)
    expect(await store.listAnswers(expired.draftKey)).toEqual([])
    expect(await store.listAnswers(meta.draftKey)).toEqual(old)
  })

  it('preserves a winning sealed result and never recreates a deleted draft', async () => {
    const { store, meta, old, next, timing } = await setup()
    const seal = store.sealForSubmission(meta.draftKey, snapshot => ({ answers: snapshot.answers, timing: snapshot.meta.instrumentMetadata }))
    const rejected = expect(store.replaceAnswers(meta, next, timing)).rejects.toBeInstanceOf(FinalDraftNotWritableError)
    const sealed = await seal
    await rejected
    expect(sealed?.payload).toEqual({ answers: old, timing: meta.instrumentMetadata })
    expect(await store.listAnswers(meta.draftKey)).toEqual(old)
    expect((await store.get(meta.draftKey))?.sealedSubmission?.payload).toEqual(sealed?.payload)
    await store.delete(meta.draftKey)
    await expect(store.replaceAnswers(meta, next, timing)).rejects.toThrow('本地测评草稿不存在')
    expect(await store.get(meta.draftKey)).toBeNull()
  })

  it('a following seal sees the complete replacement with its matching timing', async () => {
    const { store, meta, next, timing } = await setup('composite-whole')
    const replacing = store.replaceAnswers(meta, next, timing)
    const sealing = store.sealForSubmission(meta.draftKey, snapshot => ({ answers: snapshot.answers, timing: snapshot.meta.instrumentMetadata }))
    await replacing
    expect((await sealing)?.payload).toEqual({ answers: next, timing: { provenance: 'keep', ...timing } })
  })
})

// Run this same file with an IndexedDB-capable setup to exercise transaction
// aborts. The default jsdom run covers memory behavior, not native IndexedDB.
describe.skipIf(typeof IDBObjectStore === 'undefined')('IndexedDB transaction failure boundaries', () => {
  it('rolls back old-only deletion, shared updates, new-only insertion, and timing on a late abort', async () => {
    const { store, meta, old, next, timing } = await setup('composite-whole')
    const original = IDBObjectStore.prototype.put
    let observedNewRow = false
    const put = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (this: IDBObjectStore, value: unknown, key?: IDBValidKey) {
      const request = original.call(this, value, key)
      if (this.name === 'draftAnswers' && (value as FinalDraftAnswer).itemKey === 'new-only') {
        request.addEventListener('success', () => { observedNewRow = true; this.transaction.abort() })
      }
      return request
    })
    await expect(store.replaceAnswers(meta, next, timing)).rejects.toThrow()
    put.mockRestore()
    expect(observedNewRow).toBe(true)
    expect(await store.listAnswers(meta.draftKey)).toEqual(old)
    expect((await store.get(meta.draftKey))?.instrumentMetadata).toEqual(meta.instrumentMetadata)
  })

  it('rolls back answer requests if the final metadata write throws', async () => {
    const { store, meta, old, next, timing } = await setup()
    const original = IDBObjectStore.prototype.put
    const put = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (this: IDBObjectStore, value: unknown, key?: IDBValidKey) {
      if (this.name === 'draftMeta') throw new DOMException('Injected metadata quota failure', 'QuotaExceededError')
      return original.call(this, value, key)
    })
    await expect(store.replaceAnswers(meta, next, timing)).rejects.toThrow()
    put.mockRestore()
    expect(await store.listAnswers(meta.draftKey)).toEqual(old)
    expect((await store.get(meta.draftKey))?.instrumentMetadata).toEqual(meta.instrumentMetadata)
  })

  it('resolves only after the transaction completion event', async () => {
    const { store, meta, next, timing } = await setup()
    const original = IDBDatabase.prototype.transaction
    let committed = false
    vi.spyOn(IDBDatabase.prototype, 'transaction').mockImplementation(function (this: IDBDatabase, ...args: Parameters<IDBDatabase['transaction']>) {
      const transaction = original.apply(this, args)
      if (args[1] === 'readwrite') transaction.addEventListener('complete', () => { committed = true })
      return transaction
    })
    await store.replaceAnswers(meta, next, timing)
    expect(committed).toBe(true)
  })
})
