import { afterEach, describe, expect, it } from 'vitest'
import { createFinalDraftMeta, finalDraftStore } from '../finalDraftStore'
import { recordFinalSubmissionFailure } from '../finalSubmissionFailure'

const keys: string[] = []
const sealedForm = async () => {
  const draftKey = `rejected-form-${Math.random()}`
  keys.push(draftKey)
  await finalDraftStore.ensure(createFinalDraftMeta({ draftKey, instrument: 'composite-form-section', attemptId: 'attempt', attemptEpoch: 1,
    definitionHash: 'hash', contextSnapshotHash: null, deliveryMode: 'final_only', submissionId: 'submission-original-1234' }))
  await finalDraftStore.putAnswer({ draftKey, itemKey: 'grade', value: 'wrong', updatedAt: Date.now() })
  await finalDraftStore.sealForSubmission(draftKey, snapshot => ({ submissionId: snapshot.meta.submissionId, answers: snapshot.answers }))
  return draftKey
}
afterEach(async () => { await Promise.all(keys.splice(0).map(key => finalDraftStore.delete(key))) })

describe('FINAL failure recovery', () => {
  it('permits editing only a known pre-commit form validation rejection and changes submission identity', async () => {
    const key = await sealedForm()
    const next = await recordFinalSubmissionFailure(key, { status: 400, code: 'FORM_ANSWER_INVALID', message: '年级选项值无效' }, 'submission-original-1234')
    expect(next?.status).toBe('DRAFT')
    expect(next?.sealedSubmission).toBeUndefined()
    expect(next?.submissionId).not.toBe('submission-original-1234')
    await finalDraftStore.putAnswer({ draftKey: key, itemKey: 'grade', value: '7', updatedAt: Date.now() })
    expect((await finalDraftStore.listAnswers(key))[0].value).toBe('7')
  })

  it.each([{ status: 503 }, new Error('network failure'), { status: 409, code: 'SUBMISSION_ALREADY_IN_PROGRESS' }])('preserves the sealed payload for unconfirmed submission %j', async error => {
    const key = await sealedForm()
    const original = (await finalDraftStore.get(key))?.sealedSubmission
    expect((await recordFinalSubmissionFailure(key, error))?.status).toBe('RETRY_PENDING')
    expect((await finalDraftStore.get(key))?.sealedSubmission).toEqual(original)
    await expect(finalDraftStore.putAnswer({ draftKey: key, itemKey: 'grade', value: '7', updatedAt: Date.now() })).rejects.toThrow('不能继续修改')
  })

  it.each(['STALE_ATTEMPT', 'DEFINITION_MISMATCH', 'SUBMISSION_PAYLOAD_CONFLICT'])('retains true conflict %s', async code => {
    const key = await sealedForm()
    expect((await recordFinalSubmissionFailure(key, { status: 409, code }))?.status).toBe('CONFLICT')
    expect((await finalDraftStore.get(key))?.sealedSubmission).toBeDefined()
  })

  it('does not reopen a later submission in response to an older rejection', async () => {
    const key = await sealedForm()
    const next = await recordFinalSubmissionFailure(key, { status: 400, code: 'FORM_ANSWER_INVALID' }, 'other-submission')
    expect(next?.status).toBe('SUBMITTING')
    expect(next?.sealedSubmission).toBeDefined()
  })
})
