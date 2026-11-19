import { beforeEach, describe, expect, it, vi } from 'vitest'
import { InstrumentFinalSubmitError } from '../../services/instrumentFinalSubmit'

const queryRaw = vi.fn()
vi.mock('../../config/database', () => ({ prisma: { $queryRaw: (...args: unknown[]) => queryRaw(...args) } }))

import { storeWholeQuestionnaireValidation } from '../../modules/assessment-runtime/report-outbox.service'

const parent = { id: 'attempt-1', attemptEpoch: 3, frozenActiveSlotSetHash: 'slot'.padEnd(64, '0'), contextSnapshotHash: 'ctx'.padEnd(64, '0') }
const hash = 'h'.repeat(64)

beforeEach(() => { queryRaw.mockReset() })

describe('storeWholeQuestionnaireValidation idempotent no-update branch', () => {
  it('first delivery: INSERT returns the job id, single query, no follow-up read', async () => {
    let called = false
    queryRaw.mockImplementation(() => { called = true; return Promise.resolve([{ id: 'job-1' }]) })
    await expect(storeWholeQuestionnaireValidation(parent as never, 'enc', hash)).resolves.toBeUndefined()
    expect(called).toBe(true)
  })

  it('same-hash repeated delivery: zero-row update + identical persisted content is an idempotent success', async () => {
    let calls = 0
    queryRaw.mockImplementation(() => { calls++; return Promise.resolve(calls === 1 ? [] : [{ id: 'job-1' }]) })
    await expect(storeWholeQuestionnaireValidation(parent as never, 'enc', hash)).resolves.toBeUndefined()
    expect(calls).toBe(2)
  })

  it('changed frozen preparation: zero rows and no matching persisted content keeps the 409', async () => {
    queryRaw.mockImplementation(() => Promise.resolve([]))
    await expect(storeWholeQuestionnaireValidation(parent as never, 'enc', hash)).rejects.toThrow(InstrumentFinalSubmitError)
    await expect(storeWholeQuestionnaireValidation(parent as never, 'enc', hash)).rejects.toThrow('问卷已经交卷或冻结准备已变化')
  })
})
