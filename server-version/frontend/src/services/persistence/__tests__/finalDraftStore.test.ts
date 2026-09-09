import { describe, expect, it } from 'vitest'
import {
  createFinalDraftMeta,
  createFinalDraftStore,
  FinalDraftIdentityConflictError,
  FinalDraftTrialConflictError,
} from '../finalDraftStore'

const metaFor = (draftKey: string) => createFinalDraftMeta({
  draftKey,
  instrument: 'cognitive',
  attemptId: 'session-1',
  attemptEpoch: 1,
  definitionHash: 'definition-1',
  contextSnapshotHash: null,
  deliveryMode: 'final_only',
  submissionId: 'submission-123456',
})

describe('final draft persistence', () => {
  it('keeps latest answers and append-only trials in local storage', async () => {
    const store = createFinalDraftStore()
    const draftKey = `test-draft-${Date.now()}`
    await store.ensure(metaFor(draftKey))
    await store.putAnswer({ draftKey, itemKey: 'q1', value: 'first', updatedAt: Date.now() })
    await store.putAnswer({ draftKey, itemKey: 'q1', value: 'latest', updatedAt: Date.now() + 1 })
    await store.putTrial({ draftKey, trialIndex: 0, payload: { response: 'a' }, createdAt: Date.now() })
    await store.putTrial({ draftKey, trialIndex: 1, payload: { response: 'b' }, createdAt: Date.now() })

    expect((await store.listAnswers(draftKey)).map((answer) => answer.value)).toEqual(['latest'])
    expect((await store.listTrials(draftKey)).map((trial) => trial.trialIndex)).toEqual([0, 1])
    await expect(store.putTrial({ draftKey, trialIndex: 0, payload: { response: 'changed' }, createdAt: Date.now() }))
      .rejects.toBeInstanceOf(FinalDraftTrialConflictError)
    await store.delete(draftKey)
    expect(await store.snapshot(draftKey)).toBeNull()
  })

  it('deletes only requested answers without disturbing draft metadata or trials', async () => {
    const store = createFinalDraftStore()
    const draftKey = `prune-draft-${Date.now()}`
    await store.ensure(metaFor(draftKey))
    await store.putAnswer({ draftKey, itemKey: 'q1', value: 'keep?', updatedAt: Date.now() })
    await store.putAnswer({ draftKey, itemKey: 'q2', value: 'keep', updatedAt: Date.now() })
    await store.putTrial({ draftKey, trialIndex: 0, payload: { response: 'trial' }, createdAt: Date.now() })
    await store.setStatus(draftKey, 'RETRY_PENDING', { code: 'NETWORK', message: 'timeout' })

    await store.deleteAnswers(draftKey, ['q1', 'q1'])

    expect((await store.listAnswers(draftKey)).map((answer) => answer.itemKey)).toEqual(['q2'])
    expect((await store.listTrials(draftKey)).map((trial) => trial.trialIndex)).toEqual([0])
    expect((await store.get(draftKey))?.status).toBe('RETRY_PENDING')
    await store.delete(draftKey)
  })

  it('protects a draft from crossing attempt or definition identities', async () => {
    const store = createFinalDraftStore()
    const draftKey = `identity-draft-${Date.now()}`
    await store.ensure(metaFor(draftKey))
    await expect(store.ensure({ ...metaFor(draftKey), attemptEpoch: 2 }))
      .rejects.toBeInstanceOf(FinalDraftIdentityConflictError)
    await store.setStatus(draftKey, 'RETRY_PENDING', { code: 'NETWORK', message: 'timeout' })
    expect((await store.get(draftKey))?.status).toBe('RETRY_PENDING')
    await store.delete(draftKey)
  })

  it('merges instrument metadata without making it draft identity or overwriting status', async () => {
    const store = createFinalDraftStore()
    const draftKey = `metadata-draft-${Date.now()}`
    await store.ensure(metaFor(draftKey))
    await store.setStatus(draftKey, 'RETRY_PENDING', { code: 'NETWORK', message: 'timeout' })
    await store.setInstrumentMetadata(draftKey, {
      cognitiveAdministrationProvenance: {
        schemaVersion: 1,
        deviceClass: 'PHONE',
        administrationMode: 'TOUCH',
      },
    })
    const current = await store.get(draftKey)
    expect(current?.status).toBe('RETRY_PENDING')
    expect(current?.instrumentMetadata).toMatchObject({
      cognitiveAdministrationProvenance: {
        schemaVersion: 1,
        deviceClass: 'PHONE',
        administrationMode: 'TOUCH',
      },
    })
    await expect(store.ensure({ ...metaFor(draftKey), instrumentMetadata: { other: true } })).resolves.toBeTruthy()
    await store.delete(draftKey)
  })
})
