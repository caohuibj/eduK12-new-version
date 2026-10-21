import { beforeEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ findMany: vi.fn(), count: vi.fn(), cacheGet: vi.fn(), cacheSet: vi.fn() }))
vi.mock('../../config/database', () => ({ prisma: { course: { findMany: mocks.findMany, count: mocks.count } } }))
vi.mock('../../utils/cache', () => ({ cache: { get: mocks.cacheGet, set: mocks.cacheSet } }))
vi.mock('../../services/assetStorage', () => ({ getSignedAssetUrls: async () => new Map(), attachAssetReference: vi.fn(), discardUnreferencedAsset: vi.fn(), getSignedAssetUrl: vi.fn(), signKnownAsset: vi.fn(), storeAsset: vi.fn() }))
vi.mock('../../controllers/platformAccountController', () => ({ resetPasswordForPlatformAdmin: vi.fn() }))
vi.mock('../../controllers/courseStudentPasswordController', () => ({ resetPasswordForCourseTeacher: vi.fn() }))
import { courseController } from '../../controllers/courseController'

const response = () => {
  const res: any = { json: vi.fn() }
  res.status = vi.fn(() => res)
  return res
}
beforeEach(() => {
  vi.resetAllMocks()
  mocks.findMany.mockResolvedValue([])
  mocks.count.mockResolvedValue(5)
})

it('counts only owned non-library courses before paging and preserves deterministic ordering', async () => {
  const res = response()
  await courseController.list({ user: { userId: 'trainer', role: 'TEACHER' },
    query: { status: 'PUBLISHED', page: '2', pageSize: '2', excludeLibrary: 'true' } } as any, res)
  const where = { creatorId: 'trainer', status: 'PUBLISHED', isLibrary: false, courseType: { not: 'CAMPUS_ACTIVITY' } }
  expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({ where, skip: 2, take: 2,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] }))
  expect(mocks.count).toHaveBeenCalledWith({ where })
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ total: 5, page: 2, pageSize: 2 }) }))
})

it('keeps the default library-inclusive query and its cache separate', async () => {
  for (const excludeLibrary of [undefined, 'true']) {
    await courseController.list({ user: { userId: 'trainer', role: 'TEACHER' },
      query: { pageSize: '2', excludeLibrary } } as any, response())
  }
  const firstWhere = mocks.findMany.mock.calls[0][0].where
  const secondWhere = mocks.findMany.mock.calls[1][0].where
  expect(firstWhere).not.toHaveProperty('isLibrary')
  expect(secondWhere).toHaveProperty('isLibrary', false)
  expect(mocks.cacheGet.mock.calls[0][0]).not.toBe(mocks.cacheGet.mock.calls[1][0])
})
