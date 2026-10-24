import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { db } = vi.hoisted(() => ({ db: {
  teacherCode: { findUnique: vi.fn(), create: vi.fn() },
  user: { findUnique: vi.fn(), create: vi.fn() },
  $executeRaw: vi.fn(), $transaction: vi.fn(),
} }))
vi.mock('../../config/database', () => ({ prisma: db }))
vi.mock('../../utils/teacherCode', () => ({ generateTeacherCode: vi.fn(async () => 'ABCD2345') }))
vi.mock('../../utils/password', () => ({ PASSWORD_MIN_LENGTH:8, PASSWORD_MAX_LENGTH:128, isValidPassword:()=>true, hashPassword:vi.fn(async ()=>'synthetic-hash'), comparePassword:vi.fn() }))
import { teacherCodeController } from '../../controllers/teacherCodeController'
import { authController } from '../../controllers/authController'

function response() {
  const res: any = { body:null, statusCode:200 }
  res.status = vi.fn((status:number) => {res.statusCode=status; return res})
  res.json = vi.fn((body:unknown) => {res.body=body; return res})
  return res
}
const registration = {teacherCode:'ABCD2345',username:'test_teacher',password:'Synthetic123',nickname:'测试培训师'}
beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-24T02:00:00Z'))
  db.teacherCode.findUnique.mockResolvedValue({id:'code',isActive:true,maxUses:1,usedCount:0,expiresAt:new Date('2026-10-25T02:00:00Z'),accountValidityDays:90})
  db.user.findUnique.mockResolvedValue(null)
  db.user.create.mockImplementation(async ({data}) => ({id:'teacher',...data}))
  db.teacherCode.create.mockImplementation(async ({data}) => data)
  db.$executeRaw.mockResolvedValue(1)
  db.$transaction.mockImplementation(async callback=>callback(db))
})
afterEach(()=>vi.useRealTimers())

describe('teacher code and account validity are independent', () => {
  it('saves the administrator-selected redemption deadline and account duration', async () => {
    const res=response()
    await teacherCodeController.create({user:{userId:'admin'},body:{maxUses:1,expiresAt:'2026-11-01T00:00:00.000Z',accountValidityDays:180}} as any,res)
    expect(res.statusCode).toBe(200)
    expect(db.teacherCode.create.mock.calls[0][0].data).toMatchObject({createdBy:'admin',maxUses:1,expiresAt:new Date('2026-11-01T00:00:00Z'),accountValidityDays:180})
  })
  it('keeps legacy defaults when no term is supplied', async () => {
    await teacherCodeController.create({user:{userId:'admin'},body:{}} as any,response())
    expect(db.teacherCode.create.mock.calls[0][0].data).toMatchObject({maxUses:1,expiresAt:null,accountValidityDays:null})
  })
  it.each([0,-1,1.5,3651,'90',null])('rejects invalid account term %s', async accountValidityDays => {
    const res=response(); await teacherCodeController.create({user:{userId:'admin'},body:{accountValidityDays}} as any,res)
    expect(res.statusCode).toBe(400);expect(db.teacherCode.create).not.toHaveBeenCalled()
  })
  it.each(['2026-10-23T00:00:00Z','2026-10-24T02:00:00Z','invalid'])('rejects expired or invalid deadline %s',async expiresAt=>{
    const res=response();await teacherCodeController.create({user:{userId:'admin'},body:{expiresAt}} as any,res)
    expect(res.statusCode).toBe(400);expect(db.teacherCode.create).not.toHaveBeenCalled()
  })
  it('starts the account term at successful registration, not at code expiry, and keeps review required',async()=>{
    const res=response(); await authController.teacherRegister({body:registration} as any,res)
    expect(res.statusCode).toBe(200)
    expect(db.user.create.mock.calls[0][0].data).toMatchObject({role:'TEACHER',teacherApproved:false,teacherCodeId:'code',expiresAt:new Date('2027-01-22T02:00:00Z')})
  })
  it('preserves one calendar year for existing codes',async()=>{
    vi.setSystemTime(new Date('2027-03-01T02:00:00Z'))
    db.teacherCode.findUnique.mockResolvedValue({id:'legacy',isActive:true,maxUses:1,usedCount:0,expiresAt:null,accountValidityDays:null})
    await authController.teacherRegister({body:registration} as any,response())
    expect(db.user.create.mock.calls[0][0].data.expiresAt).toEqual(new Date('2028-03-01T02:00:00Z'))
  })
  it('does not let a registrant override the administrator term',async()=>{
    const res=response(); await authController.teacherRegister({body:{...registration,accountValidityDays:3650}} as any,res)
    expect(res.statusCode).toBe(400);expect(db.$transaction).not.toHaveBeenCalled()
  })
  it('creates no account when the code claim loses a race or expires',async()=>{
    db.$executeRaw.mockResolvedValue(0)
    const res=response();await authController.teacherRegister({body:registration} as any,res)
    expect(res.statusCode).toBe(400);expect(db.user.create).not.toHaveBeenCalled()
  })
  it('rejects a code at its exact expiry in verification and registration',async()=>{
    db.teacherCode.findUnique.mockResolvedValue({id:'code',isActive:true,maxUses:1,usedCount:0,expiresAt:new Date()})
    for(const [handler,body] of [[teacherCodeController.verify,{code:'ABCD2345'}],[authController.verifyTeacherCode,{teacherCode:'ABCD2345'}],[authController.teacherRegister,registration]] as const){
      const res=response();await handler({body} as any,res);expect(res.statusCode).toBe(400)
    }
    expect(db.user.create).not.toHaveBeenCalled()
  })
})
