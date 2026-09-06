import { describe, expect, it, vi, beforeEach } from 'vitest'

process.env.DATA_ENCRYPTION_KEY = process.env.DATA_ENCRYPTION_KEY ?? 'a'.repeat(64)

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    questionnaireAssessment: { findUnique: vi.fn() },
  },
}))

vi.mock('../../config/database', () => ({ prisma: mockPrisma }))

import { unifiedCompletionGuard } from '../../middleware/instrumentFinalOnly'

const makeRes = () => {
  const res: any = { statusCode: 200, body: null }
  res.status = vi.fn((code: number) => {
    res.statusCode = code
    return res
  })
  res.json = vi.fn((body: unknown) => {
    res.body = body
    return res
  })
  return res
}

const makeReq = (id: string | undefined) => ({ params: { id } } as any)

describe('unified completion guard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('passes UNIFIED_V1 assessments through to the unified finalizer', async () => {
    mockPrisma.questionnaireAssessment.findUnique.mockResolvedValue({ runtimeGeneration: 'UNIFIED_V1' })
    const res = makeRes()
    const next = vi.fn()

    await unifiedCompletionGuard(makeReq('attempt-1'), res, next)

    expect(next).toHaveBeenCalledWith()
    expect(res.statusCode).toBe(200)
    expect(mockPrisma.questionnaireAssessment.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'attempt-1' } }),
    )
  })

  it('keeps legacy attempts on the permanent LEGACY_WRITE_DISABLED 410', async () => {
    mockPrisma.questionnaireAssessment.findUnique.mockResolvedValue({ runtimeGeneration: null })
    const res = makeRes()
    const next = vi.fn()

    await unifiedCompletionGuard(makeReq('legacy-1'), res, next)

    expect(next).not.toHaveBeenCalled()
    expect(res.statusCode).toBe(410)
    expect(res.body).toMatchObject({ code: 'LEGACY_WRITE_DISABLED' })
  })

  it('delegates infrastructure failures to the error handler as 5xx, never as 410', async () => {
    mockPrisma.questionnaireAssessment.findUnique.mockRejectedValue(new Error('Connection terminated unexpectedly'))
    const res = makeRes()
    const next = vi.fn()

    await unifiedCompletionGuard(makeReq('attempt-1'), res, next)

    expect(next).toHaveBeenCalledTimes(1)
    expect(next.mock.calls[0][0]).toBeInstanceOf(Error)
    expect(next.mock.calls[0][0].message).toBe('Connection terminated unexpectedly')
    expect(res.statusCode).toBe(200)
    expect(res.body).toBeNull()
  })
})
