import { describe, expect, it } from 'vitest'
import {
  createFinalDraftMeta,
  createFinalDraftStore,
  FinalDraftIdentityConflictError,
  FinalDraftNotWritableError,
  FinalDraftPendingWithoutSealError,
  FinalDraftSealRequiredError,
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

  it('deletes only requested answers while the draft is writable', async () => {
    const store = createFinalDraftStore()
    const draftKey = `prune-draft-${Date.now()}`
    await store.ensure(metaFor(draftKey))
    await store.putAnswer({ draftKey, itemKey: 'q1', value: 'keep?', updatedAt: Date.now() })
    await store.putAnswer({ draftKey, itemKey: 'q2', value: 'keep', updatedAt: Date.now() })
    await store.putTrial({ draftKey, trialIndex: 0, payload: { response: 'trial' }, createdAt: Date.now() })

    await store.deleteAnswers(draftKey, ['q1', 'q1'])

    expect((await store.listAnswers(draftKey)).map((answer) => answer.itemKey)).toEqual(['q2'])
    expect((await store.listTrials(draftKey)).map((trial) => trial.trialIndex)).toEqual([0])
    await store.delete(draftKey)
  })

  it('protects a draft from crossing attempt or definition identities', async () => {
    const store = createFinalDraftStore()
    const draftKey = `identity-draft-${Date.now()}`
    await store.ensure(metaFor(draftKey))
    await expect(store.ensure({ ...metaFor(draftKey), attemptEpoch: 2 }))
      .rejects.toBeInstanceOf(FinalDraftIdentityConflictError)
    expect((await store.get(draftKey))?.status).toBe('DRAFT')
    await store.delete(draftKey)
  })

  it('merges instrument metadata without making it draft identity', async () => {
    const store = createFinalDraftStore()
    const draftKey = `metadata-draft-${Date.now()}`
    await store.ensure(metaFor(draftKey))
    await store.setInstrumentMetadata(draftKey, {
      cognitiveAdministrationProvenance: {
        schemaVersion: 1,
        deviceClass: 'PHONE',
        administrationMode: 'TOUCH',
      },
    })
    const current = await store.get(draftKey)
    expect(current?.status).toBe('DRAFT')
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

  it('atomically seals the logical FINAL and rejects later draft mutations', async () => {
    const store = createFinalDraftStore()
    const draftKey = `sealed-draft-${Date.now()}`
    await store.ensure(metaFor(draftKey))
    await store.putAnswer({ draftKey, itemKey: 'q1', value: { answer: 'latest' }, updatedAt: Date.now() })
    await store.putTrial({ draftKey, trialIndex: 0, payload: { response: 'trial-0' }, createdAt: Date.now() })

    let builds = 0
    const sealed = await store.sealForSubmission(draftKey, (snapshot) => {
      builds += 1
      return {
        submissionId: snapshot.meta.submissionId,
        answers: snapshot.answers.map((answer) => answer.value),
        trials: snapshot.trials.map((trial) => trial.payload),
      }
    })

    expect(sealed?.meta.status).toBe('SUBMITTING')
    expect(sealed?.meta.sealedSubmission?.schemaVersion).toBe(1)
    expect(sealed?.payload).toEqual({
      submissionId: 'submission-123456',
      answers: [{ answer: 'latest' }],
      trials: [{ response: 'trial-0' }],
    })
    await expect(store.putAnswer({ draftKey, itemKey: 'q1', value: { answer: 'too-late' }, updatedAt: Date.now() }))
      .rejects.toBeInstanceOf(FinalDraftNotWritableError)
    await expect(store.putTrial({ draftKey, trialIndex: 1, payload: { response: 'too-late' }, createdAt: Date.now() }))
      .rejects.toBeInstanceOf(FinalDraftNotWritableError)
    await expect(store.deleteAnswers(draftKey, ['q1']))
      .rejects.toBeInstanceOf(FinalDraftNotWritableError)
    await expect(store.setInstrumentMetadata(draftKey, { changed: true }))
      .rejects.toBeInstanceOf(FinalDraftNotWritableError)

    await store.setStatus(draftKey, 'RETRY_PENDING', { code: 'NETWORK', message: 'timeout' })
    const replay = await store.sealForSubmission(draftKey, () => {
      builds += 1
      return { shouldNot: 'rebuild' }
    })
    expect(builds).toBe(1)
    expect(replay?.payload).toEqual(sealed?.payload)
    expect(replay?.meta.status).toBe('RETRY_PENDING')
    await expect(store.setStatus(draftKey, 'DRAFT')).rejects.toBeInstanceOf(FinalDraftNotWritableError)
    await store.delete(draftKey)
  })

  it('keeps a draft writable when validation fails before sealing', async () => {
    const store = createFinalDraftStore()
    const draftKey = `pre-seal-failure-${Date.now()}`
    await store.ensure(metaFor(draftKey))
    await store.putAnswer({ draftKey, itemKey: 'q1', value: 'incomplete', updatedAt: Date.now() })

    await expect(store.sealForSubmission(draftKey, () => {
      throw new Error('required answer is not durably saved')
    })).rejects.toThrow('required answer is not durably saved')
    await expect(store.setStatus(draftKey, 'RETRY_PENDING', { code: 'LOCAL_VALIDATION' }))
      .rejects.toBeInstanceOf(FinalDraftSealRequiredError)
    expect((await store.get(draftKey))?.status).toBe('DRAFT')
    expect((await store.get(draftKey))?.sealedSubmission).toBeUndefined()
    await expect(store.putAnswer({ draftKey, itemKey: 'q2', value: 'fixed', updatedAt: Date.now() })).resolves.toBeUndefined()
    await store.delete(draftKey)
  })

  it('does not invent a payload for legacy pending metadata without a sealed submission', async () => {
    const store = createFinalDraftStore()
    const draftKey = `legacy-pending-${Date.now()}`
    await store.ensure(metaFor(draftKey))
    await store.putAnswer({ draftKey, itemKey: 'q1', value: 'answer', updatedAt: Date.now() })
    // Direct SUBMITTING remains representable for drafts written by a pre-FE-03A client.
    await store.setStatus(draftKey, 'SUBMITTING')

    await expect(store.sealForSubmission(draftKey, (snapshot) => ({
      submissionId: snapshot.meta.submissionId,
      answers: snapshot.answers,
    }))).rejects.toBeInstanceOf(FinalDraftPendingWithoutSealError)

    expect((await store.get(draftKey))?.sealedSubmission).toBeUndefined()
    await store.delete(draftKey)
  })
})
