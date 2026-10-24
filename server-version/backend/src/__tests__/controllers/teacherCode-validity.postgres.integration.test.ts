import { PrismaClient } from '@prisma/client'
import { describe, expect, it, vi } from 'vitest'
const { current } = vi.hoisted(()=>({current:{tx:null as any}}))
vi.mock('../../config/database',()=>({prisma:{
  teacherCode:{findUnique:(args:unknown)=>current.tx.teacherCode.findUnique(args), create:(args:unknown)=>current.tx.teacherCode.create(args)},
  user:{findUnique:(args:unknown)=>current.tx.user.findUnique(args)},
  $transaction:(callback:(tx:unknown)=>unknown)=>callback(current.tx),
}}))
import { authController } from '../../controllers/authController'
import { teacherCodeController } from '../../controllers/teacherCodeController'
const url=process.env.TEACHER_CODE_VALIDITY_POSTGRES_URL
const suite=url ? describe : describe.skip
function response(){const res:any={statusCode:200};res.status=(s:number)=>{res.statusCode=s;return res};res.json=(body:unknown)=>{res.body=body;return res};return res}
suite('teacher code validity with real PostgreSQL and rollback',()=>{
  it('persists the selected account term, consumes the code once and rolls back every synthetic row',async()=>{
    const parsed=new URL(url!);expect(['127.0.0.1','localhost']).toContain(parsed.hostname);expect(parsed.port).toBe('55432')
    const prisma=new PrismaClient({datasources:{db:{url}}});let syntheticId='';const rollback=new Error('ROLLBACK_SYNTHETIC_VALIDITY_FLOW')
    try{
      await expect(prisma.$transaction(async tx=>{
        current.tx=tx
        const owner=await tx.user.create({data:{username:`validity_${Date.now()}`,passwordHash:'synthetic-unusable-hash',role:'ADMIN'}});syntheticId=owner.id
        const created=response();await teacherCodeController.create({user:{userId:owner.id},body:{maxUses:1,expiresAt:new Date(Date.now()+86400000).toISOString(),accountValidityDays:90}} as any,created)
        expect(created.statusCode).toBe(200)
        const code=created.body.data;expect(code.accountValidityDays).toBe(90)
        const start=Date.now();const body={teacherCode:code.code,username:`term_${Date.now()}`,password:'Synthetic1234',nickname:'合成测试'}
        const registered=response();await authController.teacherRegister({body} as any,registered)
        expect(registered.statusCode).toBe(200)
        const account=await tx.user.findUniqueOrThrow({where:{id:registered.body.data.user.id}})
        expect(account.teacherApproved).toBe(false)
        expect(account.expiresAt!.getTime()).toBeGreaterThanOrEqual(start+90*86400000)
        expect(account.expiresAt!.getTime()).toBeLessThanOrEqual(Date.now()+90*86400000)
        const stored=await tx.teacherCode.findUniqueOrThrow({where:{id:code.id}})
        expect(stored.usedCount).toBe(1);expect(stored.isActive).toBe(false)
        const repeated=response();await authController.teacherRegister({body:{...body,username:'unused_teacher'}} as any,repeated);expect(repeated.statusCode).toBe(400)
        throw rollback
      },{timeout:15000})).rejects.toThrow(rollback)
      expect(await prisma.user.findUnique({where:{id:syntheticId}})).toBeNull()
    } finally {await prisma.$disconnect()}
  })
})
