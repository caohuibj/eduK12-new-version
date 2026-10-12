import { randomUUID } from 'node:crypto'
import type { Request,Response,NextFunction } from 'express'
import { afterAll,beforeAll,describe,expect,it,vi } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { integrationDatabaseUrl,requireIsolatedReleaseDatabase } from './integration-env'
import {
  resolveEducationProductMemberScope,listEducationProductMemberships,
} from '../../modules/organization/educationProductAccess'
import { resolveOrganizationAccessContext } from '../../modules/organization/access'
import { authenticateHuiteacher,authenticateSchool } from '../../middleware/auth'
import { requireTeacherProductAdmin } from '../../modules/huiteacher/authority'
import { generateToken } from '../../utils/jwt'
import {
  issueTeacherStudentInvitations,registerInvitedTeacherStudent,
} from '../../modules/huiteacher/studentInvitation.service'
import {
  issueTeacherStaffInvitation,joinInvitedTeacher,
} from '../../modules/huiteacher/staffInvitation.service'

const URL=integrationDatabaseUrl(
  'RELEASE_INTEGRATION_DATABASE_URL','PR26_INTEGRATION_DATABASE_URL','COGNITIVE_INTEGRATION_DB_URL',
)
const suite=URL?describe:describe.skip
let db:PrismaClient
const unique=(value:string)=>value+'_'+randomUUID().slice(0,12)
async function principal(role:'TEACHER'|'STUDENT'|'ADMIN'='TEACHER'){
  const id=randomUUID()
  return db.user.create({data:{
    id,username:'edutest_'+id.replace(/-/g,''),passwordHash:'synthetic',
    accountDomain:'SCHOOL',role,teacherApproved:true,
  }})
}
async function school(owner:string,product:'HUISCHOOL'|'HUITEACHER'){
  const o=await db.organization.create({data:{
    id:randomUUID(),name:unique('education-school'),productDomain:'SCHOOL',
    createdByUserId:owner,
  }})
  const membership=await db.organizationMembership.create({data:{
    id:randomUUID(),organizationId:o.id,userId:owner,orgRole:'ORG_ADMIN',
  }})
  await db.educationProductEntitlement.create({data:{
    organizationId:o.id,product,status:'ACTIVE',grantedByUserId:owner,
  }})
  return {organization:o,membership}
}
async function makeProductAdmin(org:string,member:string,userId:string){
  return db.educationProductRoleGrant.create({data:{
    id:randomUUID(),organizationId:org,membershipId:member,
    product:'HUITEACHER',role:'PRODUCT_ADMIN',grantedByUserId:userId,
  }})
}
const response=()=>{
  const state:{status:number;body:unknown}={status:200,body:null}
  const res={
    status(code:number){state.status=code;return res},
    json(body:unknown){state.body=body;return res},
    setHeader(){return res},
  } as unknown as Response
  return {state,res}
}
async function checkSession(
  middleware:typeof authenticateSchool|typeof authenticateHuiteacher,
  name:string,token:string,
){
  const req={headers:{cookie:name+'='+encodeURIComponent(token)},originalUrl:'/api/huiteacher/auth/me'} as unknown as Request
  const {state,res}=response()
  const next=vi.fn() as unknown as NextFunction
  await middleware(req,res,next)
  return {status:state.status,accepted:(next as any).mock.calls.length===1}
}

suite('Huiteacher shared education identity with independent School boundaries',()=>{
  beforeAll(async()=>{
    requireIsolatedReleaseDatabase(URL!)
    process.env.CAMPUS_ELIGIBILITY_HMAC_KEY='4d'.repeat(32)
    process.env.CAMPUS_MFA_ENCRYPTION_KEY='45'.repeat(32)
    db=new PrismaClient({datasources:{db:{url:URL!}}})
    await db.$connect()
  })
  afterAll(async()=>{await db?.$disconnect()})

  it('fails closed on Teacher-only, School-only, and separately authorized dual-product schools',async()=>{
    const teacher=await principal()
    const onlyTeacher=await school(teacher.id,'HUITEACHER')
    await makeProductAdmin(onlyTeacher.organization.id,onlyTeacher.membership.id,teacher.id)
    const session=(mfaVerifiedAt?:number)=>generateToken({
      userId:teacher.id,username:teacher.username,role:teacher.role,
      tokenVersion:teacher.tokenVersion,accountDomain:'SCHOOL',
      sessionProduct:'HUITEACHER',...(mfaVerifiedAt?{mfaVerifiedAt}:{}),
    })
    const adminRequest=(jwt:string)=>({
      params:{organizationId:onlyTeacher.organization.id},
      headers:{cookie:'huiteacher_session='+encodeURIComponent(jwt)},
      user:{userId:teacher.id,accountDomain:'SCHOOL'},
    }) as unknown as Request
    const denied=response(),deniedNext=vi.fn()
    await requireTeacherProductAdmin(adminRequest(session()),denied.res,deniedNext)
    expect(denied.state.status).toBe(403)
    expect(deniedNext).not.toHaveBeenCalled()
    const verified=response(),verifiedNext=vi.fn()
    await requireTeacherProductAdmin(adminRequest(session(Math.floor(Date.now()/1000))),
      verified.res,verifiedNext)
    expect(verifiedNext).toHaveBeenCalledTimes(1)
    expect((await resolveEducationProductMemberScope({
      actorUserId:teacher.id,organizationId:onlyTeacher.organization.id,
      product:'HUITEACHER',
    }))?.productAdmin).toBe(true)
    expect(await resolveEducationProductMemberScope({
      actorUserId:teacher.id,organizationId:onlyTeacher.organization.id,
      product:'HUISCHOOL',
    })).toBe(null)
    expect(await resolveOrganizationAccessContext({
      principal:{userId:teacher.id,platformRole:'STANDARD'},
      organizationId:onlyTeacher.organization.id,
    })).toBe(null)
    const onlySchool=await school(teacher.id,'HUISCHOOL')
    expect(await resolveEducationProductMemberScope({
      actorUserId:teacher.id,organizationId:onlySchool.organization.id,
      product:'HUITEACHER',
    })).toBe(null)
    await db.educationProductEntitlement.create({data:{
      organizationId:onlySchool.organization.id,product:'HUITEACHER',
      grantedByUserId:teacher.id,status:'ACTIVE',
    }})
    const teacherScope=await resolveEducationProductMemberScope({
      actorUserId:teacher.id,organizationId:onlySchool.organization.id,
      product:'HUITEACHER',
    })
    expect(teacherScope?.membershipId).toBe(onlySchool.membership.id)
    expect(teacherScope?.productAdmin).toBe(false)
    const schools=await listEducationProductMemberships(teacher.id,'HUITEACHER')
    expect(schools.some(x=>x.organizationId===onlyTeacher.organization.id)).toBe(true)
    expect(schools.some(x=>x.organizationId===onlySchool.organization.id)).toBe(true)
    await db.educationProductEntitlement.update({
      where:{organizationId_product:{
        organizationId:onlyTeacher.organization.id,product:'HUITEACHER',
      }},
      data:{status:'SUSPENDED',suspendedAt:new Date()},
    })
    expect(await resolveEducationProductMemberScope({
      actorUserId:teacher.id,organizationId:onlyTeacher.organization.id,
      product:'HUITEACHER',
    })).toBe(null)
    expect(await resolveEducationProductMemberScope({
      actorUserId:teacher.id,organizationId:onlySchool.organization.id,
      product:'HUISCHOOL',
    })).not.toBeNull()
  })

  it('Teacher and School browser sessions reject cross-product tokens',async()=>{
    const user=await principal()
    const now=Math.floor(Date.now()/1000)
    const common={userId:user.id,username:user.username,role:user.role,
      tokenVersion:user.tokenVersion,accountDomain:'SCHOOL' as const,mfaVerifiedAt:now}
    const teacherSession=generateToken({...common,sessionProduct:'HUITEACHER'})
    const schoolSession=generateToken({...common,sessionProduct:'HUISCHOOL'})
    expect((await checkSession(authenticateHuiteacher,'huiteacher_session',teacherSession)).accepted).toBe(true)
    expect((await checkSession(authenticateSchool,'huischool_session',teacherSession)).status).toBe(401)
    expect((await checkSession(authenticateHuiteacher,'huiteacher_session',schoolSession)).status).toBe(401)
    expect((await checkSession(authenticateSchool,'huischool_session',schoolSession)).accepted).toBe(true)
  })

  it('Teacher student invitation creates shared membership but no psychology enrollment',async()=>{
    const admin=await principal()
    const scope=await school(admin.id,'HUITEACHER')
    await makeProductAdmin(scope.organization.id,scope.membership.id,admin.id)
    const grade=await db.$queryRaw<Array<{id:string}>>`
      INSERT INTO "organization_units"("id","organization_id","unit_kind","name")
      VALUES(${randomUUID()},${scope.organization.id},'GRADE','Teacher-only grade')
      RETURNING "id"
    `
    const unit=await db.$queryRaw<Array<{id:string}>>`
      INSERT INTO "organization_units"("id","organization_id","unit_kind","name","parent_unit_id")
      VALUES(${randomUUID()},${scope.organization.id},'CLASS','Teacher-only class',${grade[0].id})
      RETURNING "id"
    `
    const issued=await issueTeacherStudentInvitations({
      organizationId:scope.organization.id,classUnitId:unit[0].id,
      actorUserId:admin.id,studentNumbers:['ST0001'],
    })
    expect(issued.list).toHaveLength(1)
    const login=unique('educ_st')
    const joined=await registerInvitedTeacherStudent({
      username:login,password:'EducationPassphrase!2026',
      studentNumber:'ST0001',inviteCode:issued.list[0].inviteCode,
    })
    const u=await db.user.findUniqueOrThrow({where:{id:joined.userId}})
    expect(u.accountDomain).toBe('SCHOOL')
    expect(joined.psychologyAdmission).toBe(false)
    expect(await db.campusStudentEnrollment.findFirst({where:{userId:u.id}})).toBeNull()
    expect(await db.organizationMembership.findFirst({where:{
      organizationId:scope.organization.id,userId:u.id,validUntil:null,
    }})).not.toBeNull()
    expect(await db.educationTeacherStudentInvitation.findFirst({where:{
      tokenHash:'not-possible',
    }})).toBeNull()
    await expect(registerInvitedTeacherStudent({
      username:unique('edu_dup'),password:'EducationPassphrase!2026',
      studentNumber:'ST0001',inviteCode:issued.list[0].inviteCode,
    })).rejects.toThrow()
  })

  it('an invited existing education teacher is not duplicated',async()=>{
    const admin=await principal()
    const a=await school(admin.id,'HUITEACHER')
    await makeProductAdmin(a.organization.id,a.membership.id,admin.id)
    const teacher=await principal()
    const invitation=await issueTeacherStaffInvitation({
      inviterUserId:admin.id,organizationId:a.organization.id,
    })
    const joined=await joinInvitedTeacher({
      actorUserId:teacher.id,inviteCode:invitation.inviteCode,
    })
    expect(joined.userId).toBe(teacher.id)
    expect((await db.user.findUnique({where:{id:teacher.id}}))?.accountDomain).toBe('SCHOOL')
    expect(await resolveEducationProductMemberScope({
      actorUserId:teacher.id,organizationId:a.organization.id,product:'HUITEACHER',
    })).not.toBeNull()
    await expect(joinInvitedTeacher({actorUserId:teacher.id,inviteCode:invitation.inviteCode})).rejects.toThrow()
  })
})
