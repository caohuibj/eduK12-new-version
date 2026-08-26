import { beforeEach, describe, expect, it, vi } from 'vitest'
import { UserRole } from '@prisma/client'

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    questionnaire: { findUnique: vi.fn() },
    scale: { findUnique: vi.fn() },
    questionnaireScale: { findUnique: vi.fn(), create: vi.fn() },
    materialGrant: { findUnique: vi.fn() },
  },
}))

vi.mock('../../config/database', () => ({ prisma: mockPrisma }))
vi.mock('../../config', () => ({ config: { materialGrantsEnabled: true, cognitiveModuleEnabled: true } }))

import { questionnaireController } from '../../controllers/questionnaireController'
import { generalQuestionnaireController } from '../../controllers/generalQuestionnaireController'

const draftQuestionnaire = {
  id: 'q-1',
  creatorId: 'teacher-1',
  status: 'DRAFT',
  questionnaireScales: [],
}

const makeReq = (scaleId: string) => ({
  user: { userId: 'teacher-1', role: UserRole.TEACHER },
  params: { id: 'q-1' },
  body: { scaleId },
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

beforeEach(() => {
  vi.clearAllMocks()
  mockPrisma.questionnaire.findUnique.mockResolvedValue(draftQuestionnaire)
  mockPrisma.questionnaireScale.findUnique.mockResolvedValue(null)
  mockPrisma.questionnaireScale.create.mockResolvedValue({ id: 'qs-1' })
  mockPrisma.materialGrant.findUnique.mockResolvedValue(null)
})

const ownDraft = { id: 'scale-own-draft', creatorId: 'teacher-1', status: 'DRAFT' }
const otherPublished = { id: 'scale-other', creatorId: 'admin-1', status: 'PUBLISHED' }
const otherDraft = { id: 'scale-other-draft', creatorId: 'admin-1', status: 'DRAFT' }

describe('questionnaire addScale grant combinations', () => {
  it('allows the teacher own DRAFT scale', async () => {
    mockPrisma.scale.findUnique.mockResolvedValue(ownDraft)
    const res = makeRes()
    await questionnaireController.addScale(makeReq(ownDraft.id) as any, res)
    expect(res.statusCode).toBe(200)
    expect(mockPrisma.questionnaireScale.create).toHaveBeenCalled()
  })

  it('forbids another teacher published scale without a grant', async () => {
    mockPrisma.scale.findUnique.mockResolvedValue(otherPublished)
    const res = makeRes()
    await questionnaireController.addScale(makeReq(otherPublished.id) as any, res)
    expect(res.statusCode).toBe(403)
    expect(mockPrisma.questionnaireScale.create).not.toHaveBeenCalled()
  })

  it('allows a granted published scale', async () => {
    mockPrisma.scale.findUnique.mockResolvedValue(otherPublished)
    mockPrisma.materialGrant.findUnique.mockResolvedValue({ id: 'g1' })
    const res = makeRes()
    await questionnaireController.addScale(makeReq(otherPublished.id) as any, res)
    expect(res.statusCode).toBe(200)
  })

  it('forbids a granted DRAFT', async () => {
    mockPrisma.scale.findUnique.mockResolvedValue(otherDraft)
    mockPrisma.materialGrant.findUnique.mockResolvedValue({ id: 'g1' })
    const res = makeRes()
    await questionnaireController.addScale(makeReq(otherDraft.id) as any, res)
    expect(res.statusCode).toBe(403)
  })
})

describe('general questionnaire addScale', () => {
  it('forbids another teacher published scale without a grant', async () => {
    mockPrisma.scale.findUnique.mockResolvedValue(otherPublished)
    const res = makeRes()
    await generalQuestionnaireController.addScale(makeReq(otherPublished.id) as any, res)
    expect(res.statusCode).toBe(403)
  })

  it('allows a granted published scale', async () => {
    mockPrisma.scale.findUnique.mockResolvedValue(otherPublished)
    mockPrisma.materialGrant.findUnique.mockResolvedValue({ id: 'g1' })
    const res = makeRes()
    await generalQuestionnaireController.addScale(makeReq(otherPublished.id) as any, res)
    expect(res.statusCode).toBe(200)
  })
})
