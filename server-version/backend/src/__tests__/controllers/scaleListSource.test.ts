import { beforeEach, describe, expect, it, vi } from 'vitest'
import { UserRole } from '@prisma/client'

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    scale: { findMany: vi.fn(), findUnique: vi.fn(), count: vi.fn() },
    assessment: { findMany: vi.fn() },
    materialGrant: { findMany: vi.fn() },
  },
}))

vi.mock('../../config/database', () => ({ prisma: mockPrisma }))
vi.mock('../../config', () => ({ config: { materialGrantsEnabled: true, cognitiveModuleEnabled: true, uploadDir: '/tmp/eduk12-controller-test-uploads' } }))

import { scaleController } from '../../controllers/scaleController'

const makeReq = (overrides: Record<string, unknown> = {}) => ({
  user: { userId: 'teacher-1', role: UserRole.TEACHER },
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

beforeEach(() => {
  vi.clearAllMocks()
  mockPrisma.materialGrant.findMany.mockResolvedValue([{ resourceId: 'scale-granted' }])
  mockPrisma.scale.count.mockResolvedValue(2)
  mockPrisma.scale.findUnique.mockResolvedValue({ id: 'scale-own', creatorId: 'admin-1' })
  mockPrisma.assessment.findMany.mockResolvedValue([])
  mockPrisma.scale.findMany.mockResolvedValue([
    { id: 'scale-own', creatorId: 'teacher-1', name: '我的量表' },
    { id: 'scale-granted', creatorId: 'admin-1', name: '授权量表' },
  ])
})

describe('scaleController.list source', () => {
  it('labels teacher rows owned/granted and never other', async () => {
    const res = makeRes()
    await scaleController.list(makeReq() as any, res)
    expect(res.body.data.list.map((row: { id: string; source: string }) => [row.id, row.source])).toEqual([
      ['scale-own', 'owned'],
      ['scale-granted', 'granted'],
    ])
    expect(res.body.data.list.some((row: { source: string }) => row.source === 'other')).toBe(false)
  })

  it('keeps student tag lists unfiltered by creatorId', async () => {
    mockPrisma.scale.findMany.mockResolvedValue([
      { tags: ['焦虑'] },
      { tags: ['注意'] },
    ])
    const res = makeRes()
    await scaleController.getTags(makeReq({ user: { userId: 'student-1', role: UserRole.STUDENT } }) as any, res)
    expect(mockPrisma.scale.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: {} }))
    expect(res.body.data.tags).toEqual(['焦虑', '注意'])
  })

  it('labels admin rows owned/other', async () => {
    mockPrisma.scale.findMany.mockResolvedValue([
      { id: 'scale-own', creatorId: 'admin-1', name: '管理员自己的' },
      { id: 'scale-teacher', creatorId: 'teacher-1', name: '教师量表' },
    ])
    const res = makeRes()
    await scaleController.list(makeReq({ user: { userId: 'admin-1', role: UserRole.ADMIN } }) as any, res)
    expect(res.body.data.list.map((row: { id: string; source: string }) => [row.id, row.source])).toEqual([
      ['scale-own', 'owned'],
      ['scale-teacher', 'other'],
    ])
  })

  it('keeps legacy Scale record listing standalone-only even for ADMIN', async () => {
    const res = makeRes()
    await scaleController.listScaleAssessments(makeReq({
      user: { userId: 'admin-1', role: UserRole.ADMIN },
      params: { scaleId: 'scale-own' },
    }) as any, res)
    expect(res.statusCode).toBe(200)
    expect(mockPrisma.assessment.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { scaleId: 'scale-own', compositeAttemptId: null },
    }))
  })
})