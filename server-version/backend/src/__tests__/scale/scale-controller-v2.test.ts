import { beforeEach, describe, expect, it, vi } from 'vitest'
import { UserRole } from '@prisma/client'

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    $transaction: vi.fn(),
    scale: { findUnique: vi.fn() },
    courseStudent: { findFirst: vi.fn() },
    materialGrant: { findUnique: vi.fn() },
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
import { encryptScaleAnswers, readScaleAnswers } from '../../modules/scale/scale-workflow.service'

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
  process.env.DATA_ENCRYPTION_KEY = 'a'.repeat(64)
  mockPrisma.$transaction.mockImplementation(async (callback: (tx: typeof mockPrisma) => unknown) => callback(mockPrisma))
  mockPrisma.assessment.updateMany.mockResolvedValue({ count: 1 })
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

  it('hides an unowned and ungranted scale from a teacher detail request', async () => {
    mockPrisma.scale.findUnique.mockResolvedValue({ ...publicScale, creatorId: 'teacher-owner' })
    mockPrisma.materialGrant.findUnique.mockResolvedValue(null)
    const res = makeRes()

    await scaleController.detail(makeReq({
      user: { userId: 'teacher-viewer', role: UserRole.TEACHER },
      params: { id: 'scale-1' },
    }) as any, res)

    expect(res.statusCode).toBe(404)
    expect(mockPrisma.materialGrant.findUnique).toHaveBeenCalledWith({
      where: {
        teacherId_resourceType_resourceId: {
          teacherId: 'teacher-viewer',
          resourceType: 'SCALE',
          resourceId: 'scale-1',
        },
      },
    })
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

  it.each([1, 5, 10])('accepts a batch of %i answers with explicit checkpoint ACKs', async (size) => {
    const definition = ADEXI_V2_PACKAGE.definition
    const items = definition.items.slice(0, size)
    const answerValue = (item: (typeof definition.items)[number]) => {
      const responseSet = definition.responseSets.find((set) => set.key === item.responseSetKey)
      return responseSet?.options[0]?.value
    }
    mockPrisma.assessment.findUnique.mockResolvedValue({
      id: 'assessment-1',
      userId: 'student-1',
      status: 'IN_PROGRESS',
      answers: encryptScaleAnswers([]),
      scale: {
        id: 'scale-1',
        code: 'adexi_v1',
        name: 'ADEXI',
        instrumentVersion: '2.0.0',
        instrumentClass: 'STANDARD',
        definition,
      },
      questionnaireAssessmentId: null,
      questionnaireAssessment: null,
    })
    const answers = items.map((item, index) => ({
      checkpointId: `checkpoint-${index + 1}`,
      checkpointSequence: index + 1,
      itemCode: item.itemCode,
      responseValue: answerValue(item),
    }))
    const res = makeRes()

    await scaleController.submitAnswersBatchV2(makeReq({
      params: { assessmentId: 'assessment-1' },
      body: { answers },
    }) as any, res)

    expect(res.statusCode).toBe(200)
    expect(res.body).toMatchObject({
      code: 0,
      data: {
        saved: size,
        acceptedIds: answers.map((answer) => answer.checkpointId),
        acceptedSequences: answers.map((answer) => answer.checkpointSequence),
      },
    })
    expect(mockPrisma.assessment.updateMany).toHaveBeenCalledTimes(1)
  })

  it('replaying an identical batch does not increase changeCount', async () => {
    const definition = ADEXI_V2_PACKAGE.definition
    const item = definition.items[0]
    const responseSet = definition.responseSets.find((set) => set.key === item.responseSetKey)
    const responseValue = responseSet?.options[0]?.value
    mockPrisma.assessment.findUnique.mockResolvedValue({
      id: 'assessment-1',
      userId: 'student-1',
      status: 'IN_PROGRESS',
      answers: encryptScaleAnswers([{ itemCode: item.itemCode, responseValue, changeCount: 4 }]),
      scale: {
        id: 'scale-1',
        code: 'adexi_v1',
        name: 'ADEXI',
        instrumentVersion: '2.0.0',
        instrumentClass: 'STANDARD',
        definition,
      },
      questionnaireAssessmentId: null,
      questionnaireAssessment: null,
    })
    const res = makeRes()

    await scaleController.submitAnswersBatchV2(makeReq({
      params: { assessmentId: 'assessment-1' },
      body: {
        answers: [{
          checkpointId: 'checkpoint-1',
          checkpointSequence: 1,
          itemCode: item.itemCode,
          responseValue,
        }],
      },
    }) as any, res)

    const stored = readScaleAnswers(mockPrisma.assessment.updateMany.mock.calls[0][0].data.answers)
    expect(stored.answers[0]).toMatchObject({ itemCode: item.itemCode, responseValue, changeCount: 4 })
  })

  it('rejects a stale batch for the same item without writing it', async () => {
    const definition = ADEXI_V2_PACKAGE.definition
    const item = definition.items[0]
    const responseSet = definition.responseSets.find((set) => set.key === item.responseSetKey)
    const currentValue = responseSet?.options[0]?.value
    const nextValue = responseSet?.options.find((option) => option.value !== currentValue)?.value
    mockPrisma.assessment.findUnique.mockResolvedValue({
      id: 'assessment-1',
      userId: 'student-1',
      status: 'IN_PROGRESS',
      answers: encryptScaleAnswers([{ itemCode: item.itemCode, responseValue: currentValue, revision: 2 }]),
      answersRevision: 2,
      scale: {
        id: 'scale-1',
        code: 'adexi_v1',
        name: 'ADEXI',
        instrumentVersion: '2.0.0',
        instrumentClass: 'STANDARD',
        definition,
      },
      questionnaireAssessmentId: null,
      questionnaireAssessment: null,
    })
    const res = makeRes()

    await scaleController.submitAnswersBatchV2(makeReq({
      params: { assessmentId: 'assessment-1' },
      body: {
        answers: [{
          checkpointId: 'checkpoint-stale',
          checkpointSequence: 1,
          itemCode: item.itemCode,
          responseValue: nextValue,
          expectedRevision: 1,
        }],
      },
    }) as any, res)

    expect(res.statusCode).toBe(409)
    expect(mockPrisma.assessment.updateMany).not.toHaveBeenCalled()
  })
})
