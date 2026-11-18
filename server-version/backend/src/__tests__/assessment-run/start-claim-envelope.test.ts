import { describe, expect, it, vi } from 'vitest'
import { lockExecutionEnvelope } from '../../modules/assessment-run/startClaim'

const lockedRow = {
  organizationId: 'org-1',
  runId: 'run-1',
  runtimeBindingKind: null,
  runtimeBindingRef: null,
  respondentUserId: 'user-1',
  scientificFrozenAt: new Date('2026-01-01T00:00:00.000Z'),
}

const shareThenLock = (tx: { $queryRaw: ReturnType<typeof vi.fn> }, row = lockedRow) => {
  tx.$queryRaw
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce([row])
}

describe('lockExecutionEnvelope known identity', () => {
  it('skips the unlocked identity SELECT when the caller already holds org/run', async () => {
    const tx = { $queryRaw: vi.fn() } as any
    shareThenLock(tx)
    const row = await lockExecutionEnvelope(tx, 'exec-1', { organizationId: 'org-1', runId: 'run-1' })
    expect(tx.$queryRaw).toHaveBeenCalledTimes(6)
    expect(row.scientificFrozenAt).toEqual(lockedRow.scientificFrozenAt)
  })

  it('still reads identity when the caller has none', async () => {
    const tx = { $queryRaw: vi.fn() } as any
    tx.$queryRaw.mockResolvedValueOnce([{ organizationId: 'org-1', runId: 'run-1' }])
    shareThenLock(tx)
    await lockExecutionEnvelope(tx, 'exec-1')
    expect(tx.$queryRaw).toHaveBeenCalledTimes(7)
  })

  it('fails closed when the locked execution identity diverges from the caller-held one', async () => {
    const tx = { $queryRaw: vi.fn() } as any
    shareThenLock(tx, { ...lockedRow, runId: 'run-other' })
    await expect(lockExecutionEnvelope(tx, 'exec-1', { organizationId: 'org-1', runId: 'run-1' }))
      .rejects.toMatchObject({ code: 'RUN_START_ENVELOPE_IDENTITY', statusCode: 500 })
  })

  it('skips irrelevant cross-product FOR SHARE queries when link flags are false', async () => {
    const schoolTx = { $queryRaw: vi.fn() } as any
    schoolTx.$queryRaw
      .mockResolvedValueOnce([{ organizationId: 'org-1', runId: 'run-1', hasCampusActivity: true, hasHuiteacherLink: false }])
      .mockResolvedValueOnce([]) // org FOR SHARE
      .mockResolvedValueOnce([]) // run FOR SHARE
      .mockResolvedValueOnce([]) // campus_activities FOR SHARE
      .mockResolvedValueOnce([lockedRow]) // execution FOR UPDATE
    const schoolRow = await lockExecutionEnvelope(schoolTx, 'exec-school')
    expect(schoolTx.$queryRaw).toHaveBeenCalledTimes(5)
    expect(schoolRow).toMatchObject({ hasCampusActivity: true, hasHuiteacherLink: false })

    const teacherTx = { $queryRaw: vi.fn() } as any
    teacherTx.$queryRaw
      .mockResolvedValueOnce([{ organizationId: 'org-1', runId: 'run-1', hasCampusActivity: false, hasHuiteacherLink: true }])
      .mockResolvedValueOnce([]) // org FOR SHARE
      .mockResolvedValueOnce([]) // run FOR SHARE
      .mockResolvedValueOnce([]) // huiteacher_evaluation_events FOR SHARE
      .mockResolvedValueOnce([]) // education_product_entitlements FOR SHARE
      .mockResolvedValueOnce([lockedRow]) // execution FOR UPDATE
    const teacherRow = await lockExecutionEnvelope(teacherTx, 'exec-teacher')
    expect(teacherTx.$queryRaw).toHaveBeenCalledTimes(6)
    expect(teacherRow).toMatchObject({ hasCampusActivity: false, hasHuiteacherLink: true })
  })
})
