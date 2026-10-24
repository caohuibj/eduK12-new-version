import { beforeEach, describe, expect, it, vi } from 'vitest'
const { db, unified, selected } = vi.hoisted(() => ({
  db: { assessment: { findFirst: vi.fn(), findUnique: vi.fn() }, $queryRaw: vi.fn() }, unified: vi.fn(), selected: vi.fn(),
}))
vi.mock('../../config/database', () => ({ prisma: db }))
vi.mock('../../modules/scale/unified-final-submit.service', () => ({ submitUnifiedScaleAssessmentFinal: unified }))
vi.mock('../../modules/composite/training-variant-child-scope', async importOriginal => ({
  ...await importOriginal<typeof import('../../modules/composite/training-variant-child-scope')>(), assertTrainingChildSelected: selected,
}))
import { submitCompositeScaleFinal, submitScaleAssessmentFinal } from '../../modules/scale/scale-final-submit.service'
import { UNIFIED_SCALE_CHILD_ADMISSION_SELECT } from '../../modules/scale/scale-admission.service'
import { InstrumentFinalSubmitError } from '../../services/instrumentFinalSubmit'
const input = { submissionId: 'submission-0000001', attemptEpoch: 1, definitionHash: 'a'.repeat(64), answers: [] }
const child = (extra: any = {}) => ({ id: 'child-1', compositeAttemptId: 'parent-1', compositeItemId: 'item-1', runtimeGeneration: 'UNIFIED_V1', attemptEpoch: 1, userId: 'student-1', ...extra })
const submit = (body: any = input) => submitCompositeScaleFinal('parent-1', 'item-1', body, { userId: 'student-1' })
beforeEach(() => {
  vi.resetAllMocks()
  db.assessment.findFirst.mockResolvedValue(child())
  unified.mockResolvedValue({ replayed: false, assessment: {}, parent: null })
})
describe('Composite FINAL request-local child locator', () => {
  it('uses one scoped admission lookup instead of locator plus admission read', async () => {
    const located = child(); db.assessment.findFirst.mockResolvedValue(located)
    await expect(submit()).resolves.toMatchObject({ replayed: false })
    expect(db.assessment.findFirst).toHaveBeenCalledExactlyOnceWith({ where: { compositeAttemptId: 'parent-1', compositeItemId: 'item-1' }, select: UNIFIED_SCALE_CHILD_ADMISSION_SELECT })
    expect(db.assessment.findUnique).not.toHaveBeenCalled()
    expect(unified).toHaveBeenCalledExactlyOnceWith({ ...input, assessmentId: 'child-1', compositeAttemptId: 'parent-1', userId: 'student-1', recoveryTokenHash: undefined }, located)
  })
  it.each([{ compositeAttemptId: 'other' }, { compositeItemId: 'other' }])('rejects an out-of-scope row %j', async extra => {
    db.assessment.findFirst.mockResolvedValue(child(extra))
    await expect(submit()).rejects.toMatchObject({ code: 'STALE_ATTEMPT', statusCode: 403 })
    expect(unified).not.toHaveBeenCalled()
  })
  it('retains missing-child behavior and overwrites untrusted principal/child/parent fields', async () => {
    await submit({ ...input, assessmentId: 'evil', userId: 'evil', compositeAttemptId: 'evil' })
    expect(unified.mock.calls[0][0]).toMatchObject({ assessmentId: 'child-1', userId: 'student-1', compositeAttemptId: 'parent-1' })
    db.assessment.findFirst.mockResolvedValue(null)
    await expect(submit()).rejects.toMatchObject({ statusCode: 404 })
    expect(unified).toHaveBeenCalledTimes(1)
  })
  it('loads a fresh row for replay and preserves the persisted replay response', async () => {
    const completed = child({ status: 'COMPLETED', result: 'persisted' })
    db.assessment.findFirst.mockResolvedValueOnce(child()).mockResolvedValueOnce(completed)
    unified.mockResolvedValueOnce({ replayed: false }).mockResolvedValueOnce({ replayed: true, assessment: { result: 'persisted' } })
    await submit(); expect(await submit()).toEqual({ replayed: true, assessment: { result: 'persisted' } })
    expect(db.assessment.findFirst).toHaveBeenCalledTimes(2)
    expect(unified.mock.calls[1][1]).toBe(completed)
  })
  it.each(['STALE_ATTEMPT', 'DEFINITION_MISMATCH', 'SUBMISSION_PAYLOAD_CONFLICT'])('preserves downstream admission or locked-reread rejection %s', async code => {
    const failure = new InstrumentFinalSubmitError(code as any, 'changed admission', 409)
    unified.mockRejectedValue(failure); await expect(submit()).rejects.toBe(failure)
  })
  it('does not convert a transaction rollback into success', async () => {
    const failure = new Error('rolled back'); unified.mockRejectedValue(failure)
    await expect(submit()).rejects.toBe(failure)
  })
  it('retains legacy broad reread and checks its fresh owner', async () => {
    db.assessment.findFirst.mockResolvedValue(child({ runtimeGeneration: null }))
    db.assessment.findUnique.mockResolvedValue(child({ runtimeGeneration: null, userId: 'other' }))
    await expect(submit()).rejects.toMatchObject({ statusCode: 403 })
    expect(selected).toHaveBeenCalledTimes(1)
    expect(db.assessment.findUnique).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ where: { id: 'child-1' }, include: expect.any(Object) }))
    expect(unified).not.toHaveBeenCalled()
  })
  it('leaves standalone admission loading unchanged', async () => {
    db.assessment.findUnique.mockResolvedValue(child({ compositeAttemptId: null, compositeItemId: null }))
    await submitScaleAssessmentFinal({ ...input, assessmentId: 'child-1', userId: 'student-1' })
    expect(db.assessment.findFirst).not.toHaveBeenCalled()
    expect(db.assessment.findUnique).toHaveBeenCalledExactlyOnceWith({ where: { id: 'child-1' }, select: UNIFIED_SCALE_CHILD_ADMISSION_SELECT })
  })
})

describe('Composite request-local deferred detail capture', () => {
  it.each(['IN_PROGRESS', 'COMPLETED'])('projects only after durable submission using fresh parent %s', async status => {
    const detail = vi.fn().mockResolvedValue({ id: 'child-1', result: 'persisted' })
    unified.mockImplementation(async (_input, _child, _whole, _db, capture) => {
      expect(db.$queryRaw).not.toHaveBeenCalled()
      capture(detail)
      return { submissionId: input.submissionId, payloadHash: 'hash', replayed: true, assessment: null, parent: null }
    })
    db.$queryRaw.mockResolvedValue([{ parent: { status, assignmentRef: null }, job: null }])
    const output = await submitCompositeScaleFinal('parent-1', 'item-1', input, { userId: 'student-1' }, { participantProjection: true })
    expect(db.$queryRaw).toHaveBeenCalledTimes(status === 'IN_PROGRESS' ? 1 : 2)
    if (status === 'IN_PROGRESS') {
      expect(detail).not.toHaveBeenCalled()
      expect(output).toEqual({ submissionId: input.submissionId, payloadHash: 'hash', replayed: true, completed: true, feedbackDeferred: true })
    } else {
      expect(detail).toHaveBeenCalledTimes(1)
      expect(output.assessment).toEqual({ id: 'child-1', result: 'persisted' })
    }
    expect(JSON.stringify(output)).not.toContain('internalContext')
    expect(Object.values(output).some(value => typeof value === 'function')).toBe(false)
  })
})
