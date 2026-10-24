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
vi.mock('../../modules/scale-library-governance/readers', () => ({ canReadLibraryScale: vi.fn().mockResolvedValue(false), libraryReadableScaleIds: vi.fn().mockResolvedValue({ systemAdmin: false, ids: [] }) }))
vi.mock('../../config', () => ({ config: { materialGrantsEnabled: true, cognitiveModuleEnabled: true, uploadDir: '/tmp/eduk12-controller-test-uploads' } }))

import { scaleController } from '../../controllers/scaleController'
import { libraryReadableScaleIds } from '../../modules/scale-library-governance/readers'

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
describe('opt-in Training catalog summary', () => {
  it.each([UserRole.ADMIN, UserRole.TEACHER])('preserves %s current visibility, pagination and totals with only catalog fields', async role => {
    const row = { id: 's', name: 'Scale', code: 'S', instrumentVersion: '2.0.0', instrumentClass: 'CUSTOM_DESCRIPTIVE', libraryEntryId: 'entry', status: 'DRAFT', description: 'Description' }
    mockPrisma.scale.findMany.mockImplementation(async args => {
      expect(args.select).toEqual(Object.fromEntries(Object.keys(row).map(key => [key, true])))
      expect(args.include).toBeUndefined()
      return [row]
    })
    mockPrisma.scale.count.mockResolvedValue(205)
    const res = makeRes()
    await scaleController.list(makeReq({ user: { userId: 'teacher-1', role }, query: { view: 'training-catalog', page: '2', pageSize: '100', status: 'DRAFT', courseId: 'course' } }) as any, res)
    const args = mockPrisma.scale.findMany.mock.calls[0][0]
    expect(args).toMatchObject({ skip: 100, take: 100, orderBy: { createdAt: 'desc' }, where: { status: 'DRAFT', courseScales: { some: { courseId: 'course' } } } })
    expect(args.where.OR).toEqual(role === UserRole.ADMIN ? [{ libraryEntryId: null }, { id: { in: [] } }] : [
      { creatorId: 'teacher-1', libraryEntryId: null }, { id: { in: ['scale-granted'] }, status: 'PUBLISHED', libraryEntryId: null }, { id: { in: [] }, status: 'PUBLISHED' },
    ])
    expect(mockPrisma.scale.count).toHaveBeenCalledExactlyOnceWith({ where: args.where })
    expect(res.body.data).toEqual({ list: [row], total: 205, page: 2, pageSize: 100, totalPages: 3, hasMore: true })
  })
  it.each([undefined, 'other'])('keeps the default full list contract for view=%s', async view => {
    const row = { id: 's', creatorId: 'teacher-1', definition: { items: [{ id: 'item' }] }, copySource: { original: 'source' }, courseScales: [{ course: { id: 'course', title: 'Course' } }], _count: { assessments: 3 } }
    mockPrisma.scale.findMany.mockResolvedValue([row])
    const res = makeRes()
    await scaleController.list(makeReq({ query: view ? { view } : {} }) as any, res)
    const args = mockPrisma.scale.findMany.mock.calls[0][0]
    expect(args.select).toBeUndefined()
    expect(args.include).toMatchObject({ creator: { select: { id: true, username: true, nickname: true } }, courseScales: { include: { course: { select: { id: true, title: true } } } }, _count: { select: { assessments: true } } })
    expect(res.body.data.list).toEqual([{ ...row, source: 'owned' }])
  })
})

  it('rereads governed visibility for each summary request and fails before data reads when authority fails', async () => {
    const req = makeReq({ user: { userId: 'admin-1', role: UserRole.ADMIN }, query: { view: 'training-catalog' } })
    vi.mocked(libraryReadableScaleIds).mockResolvedValueOnce({ systemAdmin: false, ids: ['granted-now'] })
    await scaleController.list(req as any, makeRes())
    expect(mockPrisma.scale.findMany.mock.calls[0][0].where.OR).toEqual([{ libraryEntryId: null }, { id: { in: ['granted-now'] } }])
    vi.mocked(libraryReadableScaleIds).mockResolvedValueOnce({ systemAdmin: false, ids: [] })
    await scaleController.list(req as any, makeRes())
    expect(mockPrisma.scale.findMany.mock.calls[1][0].where.OR).toEqual([{ libraryEntryId: null }, { id: { in: [] } }])
    vi.mocked(libraryReadableScaleIds).mockRejectedValueOnce(new Error('authority unavailable'))
    const denied = makeRes()
    await scaleController.list(req as any, denied)
    expect(denied.body.code).not.toBe(0)
    expect(mockPrisma.scale.findMany).toHaveBeenCalledTimes(2)
    expect(mockPrisma.scale.count).toHaveBeenCalledTimes(2)
    expect(libraryReadableScaleIds).toHaveBeenCalledTimes(3)
  })
