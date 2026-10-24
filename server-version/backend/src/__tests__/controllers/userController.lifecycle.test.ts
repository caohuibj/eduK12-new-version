import { beforeEach, describe, expect, it, vi } from 'vitest'
import { UserRole } from '@prisma/client'

const { mockPrisma, mockSetUserActiveState } = vi.hoisted(() => ({
  mockPrisma: {
    $queryRaw:vi.fn(),
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
    },
  },
  mockSetUserActiveState: vi.fn(),
}))

vi.mock('../../config/database', () => ({ prisma: mockPrisma }))
vi.mock('../../services/userLifecycleService', async () => {
  const actual = await vi.importActual<any>('../../services/userLifecycleService')
  return { ...actual, setUserActiveState: mockSetUserActiveState }
})

import { userController } from '../../controllers/userController'

const makeRes = () => {
  const res: any = { statusCode: 0, body: null }
  res.status = vi.fn((statusCode: number) => {
    res.statusCode = statusCode
    return res
  })
  res.json = vi.fn((body: unknown) => {
    res.body = body
    return res
  })
  return res
}

describe('userController lifecycle delegation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('delegates isActive changes before legacy profile-role authorization and never writes the user directly', async () => {
    mockSetUserActiveState.mockResolvedValue({ id: 'target-1', isActive: false })
    const req = {
      params: { id: 'target-1' },
      body: { isActive: false },
      user: {
        userId: 'system-1',
        username: 'system-1',
        role: UserRole.STUDENT,
        platformRole: 'SYSTEM_ADMIN',
        tokenVersion: 0,
        mustChangePassword: false,
      },
    } as any
    const res = makeRes()

    await userController.update(req, res)

    expect(mockSetUserActiveState).toHaveBeenCalledWith({
      actorUserId: 'system-1',
      targetUserId: 'target-1',
      isActive: false,
    })
    expect(mockPrisma.user.findUnique).not.toHaveBeenCalled()
    expect(mockPrisma.user.update).not.toHaveBeenCalled()
    expect(res.statusCode).toBe(0)
    expect(res.body.data).toEqual({ id: 'target-1', isActive: false })
  })

  it('rejects mixing lifecycle and profile mutations in one request', async () => {
    const req = {
      params: { id: 'target-1' },
      body: { isActive: false, nickname: 'mixed' },
      user: {
        userId: 'system-1',
        username: 'system-1',
        role: UserRole.ADMIN,
        platformRole: 'SYSTEM_ADMIN',
        tokenVersion: 0,
        mustChangePassword: false,
      },
    } as any
    const res = makeRes()

    await userController.update(req, res)

    expect(res.statusCode).toBe(400)
    expect(mockSetUserActiveState).not.toHaveBeenCalled()
    expect(mockPrisma.user.update).not.toHaveBeenCalled()
  })
})


describe('ordinary Training participant list',()=>{
 beforeEach(()=>vi.clearAllMocks())
 it('excludes every current management identity before count and pagination',async()=>{
  mockPrisma.$queryRaw.mockResolvedValueOnce([{id:'learner',username:'learner',role:'STUDENT'}]).mockResolvedValueOnce([{total:41n}])
  const res=makeRes()
  await userController.list({query:{scope:'training-participants',role:'STUDENT',page:'2',pageSize:'20'},user:{role:'ADMIN'}} as any,res)
  const [list,count]=mockPrisma.$queryRaw.mock.calls.map(([query])=>query)
  for(const query of [list,count]){
   expect(query.sql).toContain("\"account_domain\" IN ('LEGACY','TRAINING')")
   expect(query.sql).toContain("\"platform_role\" = 'STANDARD'")
   expect(query.sql).toContain('NOT EXISTS');expect(query.sql).toContain('"revoked_at" IS NULL')
   expect(query.values[0]).toBe('STUDENT')
  }
  const where=(query:any)=>query.sql.slice(query.sql.indexOf('WHERE ')).replace(/ ORDER BY[\s\S]*/,'')
  expect(where(list)).toBe(where(count));expect(list.values.slice(-2)).toEqual([20,20])
  expect(res.body.data).toMatchObject({total:41,page:2,pageSize:20,list:[{id:'learner'}]})
  expect(mockPrisma.user.findMany).not.toHaveBeenCalled();expect(mockPrisma.user.update).not.toHaveBeenCalled()
 })
 it('binds literal search text and teacher identity rather than interpolating SQL or client-side filtering',async()=>{
  mockPrisma.$queryRaw.mockResolvedValueOnce([]).mockResolvedValueOnce([{total:0n}])
  const keyword="teacher_%' OR 1=1 --",res=makeRes()
  await userController.list({query:{scope:'training-participants',role:'TEACHER',keyword}} as any,res)
  const query=mockPrisma.$queryRaw.mock.calls[0][0]
  expect(query.values).toContain('TEACHER');expect(query.values).toContain(keyword)
  expect(query.sql).not.toContain(keyword);expect(query.sql).toContain('POSITION(')
  expect(res.body.data.total).toBe(0)
 })
 it.each([{scope:'other',role:'STUDENT'},{scope:'training-participants',role:'ADMIN'},{scope:'training-participants',role:'STUDENT',keyword:['x']}])('rejects unsupported list scope or role: %j',async query=>{
  const res=makeRes();await userController.list({query} as any,res)
  expect(res.statusCode).toBe(400);expect(mockPrisma.$queryRaw).not.toHaveBeenCalled()
 })
 it('keeps the existing unscoped user directory contract unchanged',async()=>{
  mockPrisma.user.findMany.mockResolvedValue([]);mockPrisma.user.count.mockResolvedValue(0)
  const res=makeRes();await userController.list({query:{role:'STUDENT'}} as any,res)
  expect(mockPrisma.$queryRaw).not.toHaveBeenCalled()
  expect(mockPrisma.user.findMany).toHaveBeenCalledWith(expect.objectContaining({where:{accountDomain:{in:['LEGACY','TRAINING']},role:'STUDENT'}}))
 })
})
