import { randomUUID } from 'node:crypto'
import { PrismaClient } from '@prisma/client'
import { describe, expect, it, vi } from 'vitest'
const {current}=vi.hoisted(()=>({current:{tx:null as any}}))
vi.mock('../../config/database',()=>({prisma:{$transaction:(fn:(tx:unknown)=>unknown)=>fn(current.tx),$queryRaw:(...args:unknown[])=>current.tx.$queryRaw(...args)}}))
vi.mock('../../utils/sessionRevocation',()=>({isSessionRevoked:async()=>false}))
import { manageTrainingTeacher } from '../../services/trainingTeacherManagement'
import { trainingTeacherManagement } from '../../controllers/trainingTeacherManagementController'
import { authenticate } from '../../middleware/auth'
import { generateToken } from '../../utils/jwt'
import { comparePassword } from '../../utils/password'
const url=process.env.TRAINING_TEACHER_MANAGEMENT_POSTGRES_URL
const suite=url?describe:describe.skip
function response(){const res:any={statusCode:200};res.setHeader=vi.fn();res.status=(status:number)=>{res.statusCode=status;return res};res.json=(body:unknown)=>{res.body=body;return res};return res}
suite('Training teacher lifecycle with real DB, JWT checks and transaction rollback',()=>{
 it('renews, freezes, unfreezes and resets a synthetic account without affecting original records',async()=>{
  const parsed=new URL(url!);expect(['127.0.0.1','localhost']).toContain(parsed.hostname);expect(parsed.port).toBe('55432')
  const prisma=new PrismaClient({datasources:{db:{url}}});const rollback=new Error('ROLLBACK_SYNTHETIC_TEACHER_MANAGEMENT');let ids:string[]=[]
  try{
   await expect(prisma.$transaction(async tx=>{
    current.tx=tx
    const actor=await tx.user.create({data:{username:`tm_admin_${Date.now()}`,passwordHash:'synthetic-unusable',role:'STUDENT'}})
    const teacher=await tx.user.create({data:{username:`tm_teacher_${Date.now()}`,passwordHash:'synthetic-old-hash',role:'TEACHER',teacherApproved:true,expiresAt:new Date('2020-01-01T00:00:00Z')}});ids=[actor.id,teacher.id]
    await tx.adminEntryGrant.create({data:{id:randomUUID(),userId:actor.id,entry:'TRAINING',grantedBy:actor.id}})
    const session={tokenVersion:actor.tokenVersion,adminSessionId:'synthetic-session',adminVerifiedAt:Date.now()/1000}
    const base={actorUserId:actor.id,targetUserId:teacher.id,actorSession:session}
    const currentUser=()=>tx.user.findUniqueOrThrow({where:{id:teacher.id}})
    const command=async(action:'EXTEND'|'FREEZE'|'UNFREEZE',months?:number)=>manageTrainingTeacher({...base,action,months,expectedUpdatedAt:(await currentUser()).updatedAt.toISOString()})
    const start=Date.now();await command('EXTEND',3);let stored=await currentUser();expect(stored.expiresAt!.getTime()).toBeGreaterThan(start+80*86400000)
    const token=(version:number)=>generateToken({userId:teacher.id,username:teacher.username,role:'TEACHER',accountDomain:'TRAINING',tokenVersion:version} as any)
    const access=async(value:string)=>{const res=response(),next=vi.fn();await authenticate({headers:{cookie:`ptool_session=${value}`},get:()=>undefined,method:'GET',originalUrl:'/api/users/me'} as any,res,next);return {res,next}}
    const oldToken=token(stored.tokenVersion);expect((await access(oldToken)).next).toHaveBeenCalled()
    await command('FREEZE');stored=await currentUser();expect(stored.isFrozen).toBe(true);expect(stored.tokenVersion).toBe(1);expect((await access(oldToken)).res.statusCode).toBe(401)
    await command('UNFREEZE');stored=await currentUser();expect(stored.isFrozen).toBe(false);expect((await access(oldToken)).res.statusCode).toBe(401)
    const beforeResetToken=token(stored.tokenVersion);expect((await access(beforeResetToken)).next).toHaveBeenCalled()
    const reset=response();await trainingTeacherManagement({params:{id:teacher.id},body:{action:'RESET_PASSWORD',expectedUpdatedAt:stored.updatedAt.toISOString()},user:{userId:actor.id,...session}} as any,reset)
    expect(reset.statusCode).toBe(200);expect(reset.setHeader).toHaveBeenCalledWith('Cache-Control','private, no-store, max-age=0')
    stored=await currentUser();expect(stored.mustChangePassword).toBe(true);expect(await comparePassword(reset.body.data.temporaryPassword,stored.passwordHash)).toBe(true)
    expect((await access(beforeResetToken)).res.statusCode).toBe(401)
    const changedPasswordAccess=await access(token(stored.tokenVersion));expect(changedPasswordAccess.res.statusCode).toBe(403);expect(changedPasswordAccess.res.body.message).toContain('必须先修改密码')
    const audits=await tx.adminAuthorizationAudit.findMany({where:{targetUserId:teacher.id}});expect(audits).toHaveLength(4);expect(JSON.stringify(audits)).not.toContain(reset.body.data.temporaryPassword);expect(JSON.stringify(audits)).not.toContain(stored.passwordHash)
    // Revoked entry authority cannot authorize another account mutation.
    await tx.adminEntryGrant.update({where:{userId_entry:{userId:actor.id,entry:'TRAINING'}},data:{revokedAt:new Date(),revokedBy:actor.id}})
    await expect(command('FREEZE')).rejects.toMatchObject({statusCode:403})
    throw rollback
   },{timeout:20000})).rejects.toThrow(rollback)
   expect(await prisma.user.count({where:{id:{in:ids}}})).toBe(0)
   expect(await prisma.adminAuthorizationAudit.count({where:{targetUserId:{in:ids}}})).toBe(0)
  }finally{await prisma.$disconnect()}
 })
})
