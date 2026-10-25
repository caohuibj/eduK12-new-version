import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ flow: vi.fn(), encrypt: vi.fn(() => 'path-cipher') }))
vi.mock('../../config/database', () => ({ prisma: {} }))
vi.mock('../../modules/composite/training-flow-scope', () => ({ resolveTrainingFlowScope: mocks.flow }))
vi.mock('../../modules/assessment-runtime/security', () => ({ encryptUnifiedRuntimePayload: mocks.encrypt }))
import { enqueueCompositeReportForUnit, ReportProcessingLeaseLostError } from '../../modules/assessment-runtime/report-outbox.service'

const base = () => ({ id: 'parent', attemptEpoch: 1, asyncReportEpoch: null as number | null,
  status: 'IN_PROGRESS', runtimeGeneration: 'UNIFIED_V1', deliveryMode: 'FINAL_ONLY', assignmentRef: null,
  deliveryCourseId: 'course', frozenActiveSlotSetHash: 'hash', contextSnapshotHash: null,
  trainingFlowSnapshotHash: null as string | null,
  compositeAssessment: { productKind: 'QUESTIONNAIRE', reportPackageKey: null, analysisProtocolKey: null } })
function transaction(row: ReturnType<typeof base> | null = base()) {
  const findUnique = vi.fn(async ({ select }: any) => {
    if (!row) return null
    // Enforce the actual projection, rather than supplying a wide mock row.
    return select ? Object.fromEntries(Object.entries(row).filter(([key]) => select[key])) : { ...row }
  })
  return { compositeAssessmentAttempt: { findUnique, update: vi.fn(), updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    $queryRaw: vi.fn().mockResolvedValue([{ id: 'job', budgetHeld: true }]) }
}
const input = { compositeAttemptId: 'parent', attemptEpoch: 1 }
beforeEach(() => { vi.clearAllMocks(); vi.stubEnv('ASSESSMENT_REPORT_ASYNC_ENABLED', 'false'); vi.stubEnv('ASSESSMENT_WHOLE_SUBMIT_ENABLED', 'false') })
afterEach(() => vi.unstubAllEnvs())

describe('outbox definition projection preserves enrollment and flow authority', () => {
  it.each([undefined, 'false'])('omits the unused relation when new enrollment is %s', async enabled => {
    vi.stubEnv('ASSESSMENT_REPORT_ASYNC_ENABLED', enabled)
    const tx = transaction()
    expect(await enqueueCompositeReportForUnit(tx as any, input)).toBeNull()
    expect(tx.compositeAssessmentAttempt.findUnique).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ select: expect.objectContaining({ compositeAssessment: false, attemptEpoch: true, asyncReportEpoch: true, trainingFlowSnapshotHash: true }) }))
    expect(tx.$queryRaw).not.toHaveBeenCalled()
  })
  it('loads the definition and enrolls an eligible parent when enabled', async () => {
    vi.stubEnv('ASSESSMENT_REPORT_ASYNC_ENABLED', 'true')
    const tx = transaction()
    expect(await enqueueCompositeReportForUnit(tx as any, input)).toBe('job')
    expect(tx.compositeAssessmentAttempt.findUnique.mock.calls[0][0].select.compositeAssessment).toEqual(expect.objectContaining({ select: expect.any(Object) }))
    expect(tx.compositeAssessmentAttempt.updateMany).toHaveBeenCalledTimes(1)
  })
  it('does not enroll an ineligible definition', async () => {
    vi.stubEnv('ASSESSMENT_REPORT_ASYNC_ENABLED', 'true')
    const row = base(); row.compositeAssessment.productKind = 'OTHER'
    const tx = transaction(row)
    expect(await enqueueCompositeReportForUnit(tx as any, input)).toBeNull()
    expect(tx.$queryRaw).not.toHaveBeenCalled()
  })
  it('continues an enrolled job with enrollment disabled', async () => {
    const tx = transaction({ ...base(), asyncReportEpoch: 1 })
    expect(await enqueueCompositeReportForUnit(tx as any, input)).toBe('job')
    expect(tx.compositeAssessmentAttempt.findUnique.mock.calls[0][0].select.compositeAssessment).toBe(false)
    expect(tx.compositeAssessmentAttempt.updateMany).not.toHaveBeenCalled()
  })
  it('still locks, reloads and persists flow evidence with enrollment disabled', async () => {
    mocks.flow.mockResolvedValue({ evidence: {}, pathHash: 'next-hash' })
    const tx = transaction({ ...base(), trainingFlowSnapshotHash: 'flow-hash' })
    expect(await enqueueCompositeReportForUnit(tx as any, input)).toBeNull()
    expect(tx.compositeAssessmentAttempt.findUnique).toHaveBeenCalledTimes(2)
    expect(tx.compositeAssessmentAttempt.findUnique.mock.calls[1][0]).toEqual(expect.objectContaining({ include: expect.objectContaining({ compositeAssessment: expect.any(Object) }) }))
    expect(mocks.flow).toHaveBeenCalledWith(expect.any(Object), base().compositeAssessment, { db: tx, allowAdvance: true })
    expect(tx.compositeAssessmentAttempt.update).toHaveBeenCalledWith(expect.objectContaining({ data: { trainingFlowPathEncrypted: 'path-cipher', trainingFlowPathHash: 'next-hash' } }))
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1)
  })
  it('preserves invalid secondary configuration errors even when disabled', async () => {
    vi.stubEnv('ASSESSMENT_WHOLE_SUBMIT_ENABLED', 'invalid')
    await expect(enqueueCompositeReportForUnit(transaction() as any, input)).rejects.toThrow('ASSESSMENT_WHOLE_SUBMIT_ENABLED')
  })
  it('preserves missing-parent return before configuration validation', async () => {
    vi.stubEnv('ASSESSMENT_REPORT_ASYNC_ENABLED', 'invalid')
    expect(await enqueueCompositeReportForUnit(transaction(null) as any, input)).toBeNull()
  })
  it('reloads the full current parent if enrollment turns on during the read', async () => {
    const tx = transaction(); const read = tx.compositeAssessmentAttempt.findUnique.getMockImplementation()!
    tx.compositeAssessmentAttempt.findUnique.mockImplementationOnce(async args => { const row = await read(args); vi.stubEnv('ASSESSMENT_REPORT_ASYNC_ENABLED', 'true'); return row })
    expect(await enqueueCompositeReportForUnit(tx as any, input)).toBe('job')
    expect(tx.compositeAssessmentAttempt.findUnique).toHaveBeenCalledTimes(2)
    expect(tx.compositeAssessmentAttempt.findUnique.mock.calls[1][0].select.compositeAssessment).not.toBe(false)
  })
  it('does not reload or validate changed configuration for an already enrolled parent', async () => {
    const tx = transaction({ ...base(), asyncReportEpoch: 1 }); const read = tx.compositeAssessmentAttempt.findUnique.getMockImplementation()!
    tx.compositeAssessmentAttempt.findUnique.mockImplementationOnce(async args => { const row = await read(args); vi.stubEnv('ASSESSMENT_REPORT_ASYNC_ENABLED', 'invalid'); return row })
    expect(await enqueueCompositeReportForUnit(tx as any, input)).toBe('job')
    expect(tx.compositeAssessmentAttempt.findUnique).toHaveBeenCalledTimes(1)
  })
  it('rejects a stale enrolled epoch before any job write', async () => {
    const tx = transaction({ ...base(), asyncReportEpoch: 1 })
    await expect(enqueueCompositeReportForUnit(tx as any, { ...input, attemptEpoch: 2 })).rejects.toMatchObject({ code: 'STALE_ATTEMPT' })
    expect(tx.$queryRaw).not.toHaveBeenCalled()
  })
  it('keeps the separate whole receipt lease check and never loads the parent projection', async () => {
    const tx = transaction()
    const wholeReceipt = { acceptedAtMs: 1 } as any
    expect(await enqueueCompositeReportForUnit(tx as any, { ...input, wholeReceipt })).toBe('job')
    tx.$queryRaw.mockResolvedValueOnce([])
    await expect(enqueueCompositeReportForUnit(tx as any, { ...input, wholeReceipt })).rejects.toBeInstanceOf(ReportProcessingLeaseLostError)
    expect(tx.compositeAssessmentAttempt.findUnique).not.toHaveBeenCalled()
  })
})
