import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient, UserRole } from '@prisma/client'
import { integrationDatabaseUrl } from './integration-env'
import {
  replaceCampusRoster, setCampusRegistrationWindow, issueCampusActivationCodes,
  registerCampusStudent, approveCampusClass, readCampusClassSummary,
  assertCampusPsychologyStaff, quarantineCampusStudent,
  digestCampusStudentNumber,
} from '../../modules/campus/admission.service'
import { issueSchoolStudentRecovery, completeSchoolStudentRecovery } from '../../modules/campus/recovery.service'
import { createOrganizationUnit } from '../../modules/organization/structure'
import { forceResetPasswordBySystemAdmin } from '../../services/accountAuthorityService'
import { setUserActiveState } from '../../services/userLifecycleService'
import { comparePassword } from '../../utils/password'
import type { AuthenticatedPrincipal } from '../../types'

const URL = integrationDatabaseUrl(
  'RELEASE_INTEGRATION_DATABASE_URL',
  'PR26_INTEGRATION_DATABASE_URL',
  'COGNITIVE_INTEGRATION_DB_URL',
)
const suite = URL ? describe : describe.skip
let db: PrismaClient
const nonce=()=>randomUUID().slice(0,8)
const studentNo=(suffix:string)=>'Q'+nonce()+suffix
const name=(prefix:string)=>prefix+'_'+nonce()
const principal=(u:{id:string;username:string;role:UserRole}):AuthenticatedPrincipal=>({
  userId:u.id,username:u.username,role:u.role,
  platformRole:'STANDARD',tokenVersion:0,mustChangePassword:false,accountDomain:'SCHOOL',
})
async function school() {
  const admin=await db.user.create({data:{
    username:'school_admin_'+randomUUID().replace(/-/g,''),passwordHash:'synthetic-fixture',
    accountDomain:'SCHOOL',role:UserRole.ADMIN,
  }})
  const org=await db.organization.create({data:{
    id:randomUUID(),name:name('campus-a'),productDomain:'SCHOOL',createdByUserId:admin.id,
  }})
  await db.organizationMembership.create({data:{
    id:randomUUID(),organizationId:org.id,userId:admin.id,orgRole:'ORG_ADMIN',
  }})
  const grade=await createOrganizationUnit({
    organizationId:org.id,unitKind:'GRADE',name:name('grade'),
  })
  const classroom=await createOrganizationUnit({
    organizationId:org.id,unitKind:'CLASS',name:name('class'),parentUnitId:grade.id,
  })
  const counselor=await db.user.create({data:{
    username:'school_counselor_'+randomUUID().replace(/-/g,''),
    accountDomain:'SCHOOL',role:UserRole.TEACHER,passwordHash:'synthetic-fixture',
  }})
  const membership=await db.organizationMembership.create({data:{
    id:randomUUID(),organizationId:org.id,userId:counselor.id,orgRole:'MEMBER',
  }})
  await db.organizationPersonaGrant.create({data:{
    id:randomUUID(),organizationId:org.id,membershipId:membership.id,
    persona:'COUNSELOR',grantedByUserId:admin.id,
  }})
  await db.organizationCapabilityGrant.create({data:{
    id:randomUUID(),organizationId:org.id,membershipId:membership.id,
    capability:'PSYCHOLOGY_STAFF',grantedByUserId:admin.id,
  }})
  return {
    admin:principal(admin),counselor:principal(counselor),
    org:org.id,classId:classroom.id,
  }
}
suite('Huischool PR1 admission, account isolation and recovery — isolated PostgreSQL',()=>{
  beforeAll(async()=>{
    // Synthetic-only keys. No production secrets or students are involved.
    process.env.CAMPUS_ELIGIBILITY_HMAC_KEY='12'.repeat(32)
    db=new PrismaClient({datasources:{db:{url:URL!}}})
    await db.$connect()
  })
  afterAll(async()=>{await db?.$disconnect()})

  it('registers two students exactly once, then whole-class approval activates school-only membership',async()=>{
    const f=await school(),n1=studentNo('a'),n2=studentNo('b')
    const roster=await replaceCampusRoster({
      actor:f.admin,organizationId:f.org,classUnitId:f.classId,studentNumbers:[n1,n2],
    })
    expect(roster).toMatchObject({eligibleCount:2,status:'DRAFT'})
    const closesAt=new Date(Date.now()+40*60_000)
    await setCampusRegistrationWindow({
      actor:f.admin,organizationId:f.org,classUnitId:f.classId,action:'OPEN',closesAt,
    })
    const issued=await issueCampusActivationCodes({
      actor:f.admin,organizationId:f.org,classUnitId:f.classId,count:2,ttlMinutes:30,
    })
    expect(new Set(issued.codes).size).toBe(2)
    const options={
      organizationId:f.org,classUnitId:f.classId,studentNumber:n1,
      activationCode:issued.codes[0],username:name('school_student'),password:'StudentTest123',
    }
    const raced=await Promise.allSettled([
      registerCampusStudent(options),
      registerCampusStudent({...options,username:name('school_student')}),
    ])
    expect(raced.filter(row=>row.status==='fulfilled')).toHaveLength(1)
    expect(raced.filter(row=>row.status==='rejected')).toHaveLength(1)
    const first=(raced.find(row=>row.status==='fulfilled') as PromiseFulfilledResult<{
      userId:string;status:string
    }>).value
    expect(first.status).toBe('PENDING_CLASS_APPROVAL')
    // School membership is not established just because a student registered.
    expect(await db.organizationMembership.count({
      where:{userId:first.userId,organizationId:f.org},
    })).toBe(0)
    const second=await registerCampusStudent({
      ...options,studentNumber:n2,activationCode:issued.codes[1],username:name('school_student'),
    })
    const summary=await readCampusClassSummary({
      actor:f.admin,organizationId:f.org,classUnitId:f.classId,
    })
    expect(summary).toMatchObject({eligibleCount:2,registeredCount:2,unresolvedIncidents:0,status:'OPEN'})
    await expect(approveCampusClass({
      actor:f.counselor,organizationId:f.org,classUnitId:f.classId,
      expectedRosterVersion:roster.rosterVersion,
    })).rejects.toMatchObject({code:'APPROVAL_PRECONDITION_FAILED'})
    await setCampusRegistrationWindow({
      actor:f.admin,organizationId:f.org,classUnitId:f.classId,action:'CLOSE',
    })
    await expect(assertCampusPsychologyStaff(f.admin,f.org)).rejects.toMatchObject({
      code:'PSYCHOLOGY_STAFF_REQUIRED',
    })
    const approved=await approveCampusClass({
      actor:f.counselor,organizationId:f.org,classUnitId:f.classId,
      expectedRosterVersion:roster.rosterVersion,
    })
    expect(approved).toMatchObject({status:'APPROVED',approvedCount:2})
    expect(await db.organizationMembership.count({
      where:{organizationId:f.org,userId:{in:[first.userId,second.userId]},validUntil:null},
    })).toBe(2)
    const classAssignments=await db.$queryRaw<Array<{n:number}>>`
      SELECT COUNT(*)::int AS "n" FROM "organization_student_class_assignments"
      WHERE "organization_id"=${f.org} AND "class_unit_id"=${f.classId}
    `
    expect(classAssignments[0]?.n).toBe(2)
    await expect(approveCampusClass({
      actor:f.counselor,organizationId:f.org,classUnitId:f.classId,
      expectedRosterVersion:roster.rosterVersion,
    })).rejects.toMatchObject({code:'APPROVAL_PRECONDITION_FAILED'})
  })

  it('rejects another school, wrong class and stale activation codes without consuming eligibility',async()=>{
    const schoolA=await school(),schoolB=await school()
    const number=studentNo('x')
    await replaceCampusRoster({actor:schoolA.admin,organizationId:schoolA.org,
      classUnitId:schoolA.classId,studentNumbers:[number]})
    await setCampusRegistrationWindow({actor:schoolA.admin,organizationId:schoolA.org,
      classUnitId:schoolA.classId,action:'OPEN',closesAt:new Date(Date.now()+3600000)})
    const {codes}=await issueCampusActivationCodes({
      actor:schoolA.admin,organizationId:schoolA.org,classUnitId:schoolA.classId,count:1,ttlMinutes:30,
    })
    const input={organizationId:schoolB.org,classUnitId:schoolB.classId,studentNumber:number,
      activationCode:codes[0],username:name('campus_student'),password:'StudentTest123'}
    await expect(registerCampusStudent(input)).rejects.toMatchObject({
      code:'CLASS_ADMISSION_NOT_FOUND',
    })
    expect(await db.campusStudentEligibility.count({where:{
      organizationId:schoolA.org,studentNoDigest:digestCampusStudentNumber(schoolA.org,number),
      claimedUserId:null,
    }})).toBe(1)
    await expect(registerCampusStudent({...input,organizationId:schoolA.org,classUnitId:schoolA.classId,
      activationCode:codes[0]+'x'})).rejects.toMatchObject({code:'CAMPUS_REGISTRATION_UNAVAILABLE'})
  })

  it('quarantines suspected takeover without transferring or deleting FINAL ownership',async()=>{
    const f=await school(),number=studentNo('q')
    await replaceCampusRoster({
      actor:f.admin,organizationId:f.org,classUnitId:f.classId,studentNumbers:[number],
    })
    await setCampusRegistrationWindow({actor:f.admin,organizationId:f.org,
      classUnitId:f.classId,action:'OPEN',closesAt:new Date(Date.now()+3600000)})
    const {codes}=await issueCampusActivationCodes({
      actor:f.admin,organizationId:f.org,classUnitId:f.classId,count:1,ttlMinutes:30,
    })
    const student=await registerCampusStudent({organizationId:f.org,classUnitId:f.classId,
      studentNumber:number,activationCode:codes[0],username:name('school_student'),password:'StudentTest123',
    })
    const result=await quarantineCampusStudent({
      actor:f.admin,organizationId:f.org,classUnitId:f.classId,studentNumber:number,
    })
    expect(result.status).toBe('QUARANTINED')
    expect(await db.user.findUnique({where:{id:student.userId},select:{isFrozen:true,tokenVersion:true}}))
      .toMatchObject({isFrozen:true,tokenVersion:1})
    expect(await db.campusStudentEnrollment.findUnique({where:{userId:student.userId}}))
      .toMatchObject({status:'QUARANTINED'})
  })

  it('recovers only an offline-verified school student and revokes old sessions',async()=>{
    const f=await school(),number=studentNo('r')
    await replaceCampusRoster({
      actor:f.admin,organizationId:f.org,classUnitId:f.classId,studentNumbers:[number],
    })
    await setCampusRegistrationWindow({actor:f.admin,organizationId:f.org,
      classUnitId:f.classId,action:'OPEN',closesAt:new Date(Date.now()+3600000)})
    const {codes}=await issueCampusActivationCodes({
      actor:f.admin,organizationId:f.org,classUnitId:f.classId,count:1,ttlMinutes:30,
    })
    const user=await registerCampusStudent({organizationId:f.org,classUnitId:f.classId,
      studentNumber:number,activationCode:codes[0],username:name('schoolstudent'),
      password:'StudentTest123',
    })
    await expect(issueSchoolStudentRecovery({actor:f.admin,organizationId:f.org,
      classUnitId:f.classId,studentNumber:number,reasonCode:'FORGOT_PASSWORD',verifiedOffline:false,
    })).rejects.toMatchObject({code:'OFFLINE_VERIFICATION_REQUIRED'})
    const recovery=await issueSchoolStudentRecovery({actor:f.admin,organizationId:f.org,
      classUnitId:f.classId,studentNumber:number,reasonCode:'FORGOT_LOGIN',verifiedOffline:true,
    })
    const newLogin=name('recovered_school')
    await expect(completeSchoolStudentRecovery({
      recoveryCode:recovery.recoveryCode,newPassword:'ReplacementP123',newLogin,
    })).resolves.toMatchObject({recovered:true})
    const current=await db.user.findUniqueOrThrow({where:{id:user.userId}})
    expect(current.tokenVersion).toBe(1)
    expect(await comparePassword('ReplacementP123',current.passwordHash)).toBe(true)
    expect((await db.campusAccount.findUniqueOrThrow({where:{userId:user.userId}})).normalizedLogin)
      .toBe(newLogin)
    await expect(completeSchoolStudentRecovery({
      recoveryCode:recovery.recoveryCode,newPassword:'NewPassword123',
    })).rejects.toMatchObject({code:'RECOVERY_UNAVAILABLE'})
  })

  it('hides school targets from legacy platform reset and account lifecycle mutations',async()=>{
    const f=await school()
    const system=await db.user.create({data:{
      username:'test_system_'+randomUUID().replace(/-/g,''),
      role:UserRole.ADMIN,platformRole:'SYSTEM_ADMIN',
      passwordHash:'synthetic-fixture',accountDomain:'LEGACY',
    }})
    await expect(forceResetPasswordBySystemAdmin({
      actorUserId:system.id,targetUserId:f.admin.userId,passwordHash:'blocked',
    })).rejects.toMatchObject({code:'USER_NOT_FOUND',statusCode:404})
    await expect(setUserActiveState({
      actorUserId:system.id,targetUserId:f.admin.userId,isActive:false,
    })).rejects.toMatchObject({code:'USER_NOT_FOUND',statusCode:404})
    const schoolAccount=await db.user.findUniqueOrThrow({where:{id:f.admin.userId}})
    expect(schoolAccount.isActive).toBe(true)
    expect(schoolAccount.passwordHash).toBe('synthetic-fixture')
  })
})
