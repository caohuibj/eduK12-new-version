import { beforeEach, describe, expect, it, vi } from 'vitest'
import { UserRole } from '@prisma/client'

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    $transaction: vi.fn(),
    scale: { findUnique: vi.fn() },
    courseStudent: { findFirst: vi.fn() },
    assessment: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}))

vi.mock('../../config/database', () => ({ prisma: mockPrisma }))

import { scaleController } from '../../controllers/scaleController'
import { ADEXI_V2_PACKAGE } from '../../modules/scale/scale-package.registry'

const makeReq = (overrides: Record<string, unknown> = {}) => ({
  user: { userId: 'student-1', role: UserRole.STUDENT },
  body: {},
  params: {},
  query: {},
  ...overrides,
})

const makeRes = () => {
  const res: any = { statusCode: 200, body: null }
  res.status = vi.fn((code: number) => {
    res.statusCode = code
    return res
  })
  res.json = vi.fn((body: any) => {
    res.body = body
    return res
  })
  return res
}

const publicScale = {
  id: 'scale-1',
  code: 'adexi_v1',
  name: 'ADEXI',
  description: null,
  instruction: null,
  estimatedTime: 10,
  status: 'PUBLISHED',
  visibility: 'PUBLIC',
  instrumentClass: 'STANDARD',
  instrumentVersion: '2.0.0',
  definition: ADEXI_V2_PACKAGE.definition,
  definitionHash: null,
  creatorId: 'admin-1',
  courseScales: [],
  creator: { id: 'admin-1', username: 'admin', nickname: null },
  _count: { assessments: 0 },
}

beforeEach(() => {
  vi.clearAllMocks()
  mockPrisma.$transaction.mockImplementation(async (callback: (tx: typeof mockPrisma) => unknown) => callback(mockPrisma))
})

describe('Scale v2 controller boundaries', () => {
  it('hides a hidden scale from a student detail request', async () => {
    mockPrisma.scale.findUnique.mockResolvedValue({ ...publicScale, visibility: 'HIDDEN' })
    const res = makeRes()

    await scaleController.detail(makeReq({ params: { id: 'scale-1' } }) as any, res)

    expect(res.statusCode).toBe(404)
    expect(mockPrisma.courseStudent.findFirst).not.toHaveBeenCalled()
  })

  it('blocks a student from starting a non-published scale by id', async () => {
    mockPrisma.scale.findUnique.mockResolvedValue({ ...publicScale, status: 'DRAFT', visibility: 'HIDDEN' })
    const res = makeRes()

    await scaleController.startAssessmentV2(makeReq({ params: { scaleId: 'scale-1' } }) as any, res)

    expect(res.statusCode).toBe(404)
    expect(mockPrisma.assessment.findFirst).not.toHaveBeenCalled()
  })

  it('keeps an assessment in progress when a required item is missing', async () => {
    mockPrisma.assessment.findUnique.mockResolvedValue({
      id: 'assessment-1',
      userId: 'student-1',
      status: 'IN_PROGRESS',
      answers: [{ itemCode: 'ADEXI-01', responseValue: 'never' }],
      startedAt: new Date('2026-08-27T00:00:00.000Z'),
      scale: {
        id: 'scale-1',
        code: 'adexi_v1',
        name: 'ADEXI',
        instrumentVersion: '2.0.0',
        instrumentClass: 'STANDARD',
        definition: null,
      },
    })
    const res = makeRes()

    await scaleController.completeAssessmentV2(makeReq({ params: { assessmentId: 'assessment-1' } }) as any, res)

    expect(res.statusCode).toBe(409)
    expect(res.body.message).toContain('必答题')
    expect(mockPrisma.assessment.updateMany).not.toHaveBeenCalled()
  })
})
