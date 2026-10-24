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

it.each([
  ['createdAt','asc',[{createdAt:'asc'},{id:'asc'}]],
  ['createdAt','desc',[{createdAt:'desc'},{id:'desc'}]],
  ['creator','asc',[{creator:{username:'asc'}},{createdAt:'desc'},{id:'desc'}]],
  ['creator','desc',[{creator:{username:'desc'}},{createdAt:'desc'},{id:'desc'}]],
])('sorts all matching courses before paging: %s %s',async(sortBy,sortOrder,orderBy)=>{
  await courseController.list({user:{userId:'manager',role:'ADMIN'},query:{sortBy,sortOrder,creatorId:'trainer-2',page:'2',pageSize:'20'}} as any,response())
  const where={courseType:{not:'CAMPUS_ACTIVITY'},creatorId:'trainer-2'}
  expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({where,orderBy,skip:20,take:20}))
  expect(mocks.count).toHaveBeenCalledWith({where})
})
it('keeps creator and sort variants isolated in cache keys',async()=>{
  for(const query of [{},{creatorId:'trainer-1'},{creatorId:'trainer-2'},{sortBy:'creator',sortOrder:'asc'},{sortBy:'createdAt',sortOrder:'asc'}]){
    await courseController.list({user:{userId:'manager',role:'ADMIN'},query} as any,response())
  }
  expect(new Set(mocks.cacheGet.mock.calls.map(([key])=>key)).size).toBe(5)
})
it('intersects requested creator with teacher ownership rather than widening access',async()=>{
  await courseController.list({user:{userId:'trainer-1',role:'TEACHER'},query:{creatorId:'trainer-2'}} as any,response())
  expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({where:{courseType:{not:'CAMPUS_ACTIVITY'},creatorId:'trainer-1',AND:[{creatorId:'trainer-2'}]}}))
})
it('retains active student membership while filtering by creator',async()=>{
  await courseController.list({user:{userId:'learner',role:'STUDENT'},query:{creatorId:'trainer-2',sortBy:'creator',sortOrder:'asc'}} as any,response())
  expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({where:{courseType:{not:'CAMPUS_ACTIVITY'},creatorId:'trainer-2',isLibrary:false,students:{some:{studentId:'learner',status:{in:['ACTIVE','APPROVED']}}}}}))
})
it.each([{sortBy:'title'},{sortOrder:'invalid'},{sortBy:['creator']},{creatorId:['trainer']},{creatorId:''}])('rejects invalid read-only query parameters: %j',async query=>{
  const res=response();await courseController.list({user:{userId:'manager',role:'ADMIN'},query} as any,res)
  expect(res.status).toHaveBeenCalledWith(400);expect(mocks.findMany).not.toHaveBeenCalled()
})
