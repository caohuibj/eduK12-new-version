import { randomUUID } from 'node:crypto'
import { PrismaClient, UserRole } from '@prisma/client'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { integrationDatabaseUrl } from './integration-env'
import { createOrganizationUnit } from '../../modules/organization/structure'
import {
  replaceCampusRoster, setCampusRegistrationWindow, issueCampusActivationCodes,
  registerCampusStudent, approveCampusClass,
} from '../../modules/campus/admission.service'
import {
  createCampusActivity,changeCampusActivityStatus,CampusActivityError,
} from '../../modules/campus/activity.service'
import { allocateCampusActivityParticipants } from '../../modules/campus/activity.allocation'
import { addCampusActivityTask,listCampusStudentTasks } from '../../modules/campus/activity.tasks'
import { assignmentController } from '../../controllers/assignmentController'
import { courseController } from '../../controllers/courseController'
import { checkinController } from '../../controllers/checkinController'
import type { Request, Response } from 'express'
import { createCampusActivityRunDraft } from '../../modules/campus/activity.runs'
import { campusRunParticipantScope } from '../../modules/campus/activity.runScope'
import { hasActiveCourseMembership } from '../../utils/courseAccess'
import type { AuthenticatedPrincipal } from '../../types'

const DB_URL=integrationDatabaseUrl(
  'RELEASE_INTEGRATION_DATABASE_URL','PR26_INTEGRATION_DATABASE_URL',
)
const suite=DB_URL?describe:describe.skip
let db:PrismaClient
// PR1校园登录别名最长32位；合成fixture不可把完整UUID拼到前缀后导致注册拒绝。
const userName=(prefix:string)=>prefix+randomUUID().replace(/-/g,'').slice(0,32-prefix.length)
const actor=(u:{id:string;username:string;role:UserRole}):AuthenticatedPrincipal=>({
  userId:u.id,username:u.username,role:u.role,platformRole:'STANDARD',
  tokenVersion:0,mustChangePassword:false,accountDomain:'SCHOOL',
})
async function fixture(){
  const admin=await db.user.create({data:{
    username:userName('hs_admin_'),passwordHash:'synthetic-only',
    accountDomain:'SCHOOL',role:UserRole.ADMIN,
  }})
  const organization=await db.organization.create({data:{
    id:randomUUID(),name:userName('School '),productDomain:'SCHOOL',
    createdByUserId:admin.id,
  }})
  const adminMember=await db.organizationMembership.create({data:{
    id:randomUUID(),organizationId:organization.id,userId:admin.id,orgRole:'ORG_ADMIN',
  }})
  const grade=await createOrganizationUnit({
    organizationId:organization.id,unitKind:'GRADE',name:'五年级',
  })
  const cls=await createOrganizationUnit({
    organizationId:organization.id,unitKind:'CLASS',name:'二班',parentUnitId:grade.id,
  })
  const counselor=await db.user.create({data:{
    username:userName('hs_counselor_'),passwordHash:'synthetic-only',
    accountDomain:'SCHOOL',role:UserRole.TEACHER,
  }})
  const psychMember=await db.organizationMembership.create({data:{
    id:randomUUID(),organizationId:organization.id,userId:counselor.id,orgRole:'MEMBER',
  }})
  await db.organizationPersonaGrant.create({data:{
    id:randomUUID(),organizationId:organization.id,
    membershipId:psychMember.id,persona:'COUNSELOR',grantedByUserId:admin.id,
  }})
  await db.organizationCapabilityGrant.create({data:{
    id:randomUUID(),organizationId:organization.id,
    membershipId:psychMember.id,capability:'PSYCHOLOGY_STAFF',grantedByUserId:admin.id,
  }})
  const studentNumber='S'+randomUUID().slice(0,8)
  const roster=await replaceCampusRoster({
    actor:actor(admin),organizationId:organization.id,classUnitId:cls.id,
    studentNumbers:[studentNumber],
  })
  await setCampusRegistrationWindow({
    actor:actor(admin),organizationId:organization.id,classUnitId:cls.id,
    action:'OPEN',closesAt:new Date(Date.now()+40*60_000),
  })
  const code=await issueCampusActivationCodes({
    actor:actor(admin),organizationId:organization.id,classUnitId:cls.id,
    count:1,ttlMinutes:35,
  })
  const student=await registerCampusStudent({
    organizationId:organization.id,classUnitId:cls.id,
    studentNumber,activationCode:code.codes[0],
    username:userName('hs_participant_'),password:'SyntheticPassword123',
  })
  await setCampusRegistrationWindow({
    actor:actor(admin),organizationId:organization.id,classUnitId:cls.id,
    action:'CLOSE',
  })
  await approveCampusClass({
    actor:actor(counselor),organizationId:organization.id,classUnitId:cls.id,
    expectedRosterVersion:roster.rosterVersion,
  })
  const member=await db.organizationMembership.findFirstOrThrow({where:{
    userId:student.userId,organizationId:organization.id,validUntil:null,
  }})
  const studentUser=await db.user.findUniqueOrThrow({where:{id:student.userId}})
  return {
    organizationId:organization.id,classUnitId:cls.id,
    admin:actor(admin),counselor:actor(counselor),
    student:actor(studentUser),studentMember:member.id,adminMember:adminMember.id,
  }
}
suite('Huischool Activity lifecycle, independent training boundary and task gate — isolated PostgreSQL',()=>{
  beforeAll(async()=>{
    process.env.CAMPUS_ELIGIBILITY_HMAC_KEY='56'.repeat(32)
    db=new PrismaClient({datasources:{db:{url:DB_URL!}}})
    await db.$connect()
  })
  afterAll(async()=>{await db?.$disconnect()})

  it('keeps legacy Course records typed LEGACY and forbids a SCHOOL account creating legacy/training Course',async()=>{
    const legacyUser=await db.user.create({data:{
      username:userName('training_teacher_'),passwordHash:'synthetic',
      accountDomain:'LEGACY',role:'TEACHER',
    }})
    const old=await db.course.create({data:{
      title:'History',creatorId:legacyUser.id,
      courseCode:userName('legacy_'),
    }})
    expect(old.courseType).toBe('LEGACY_COURSE')
    // New training Course created through its existing public service route
    // must be tagged TRAINING_COURSE without relabelling any historical row.
    let payload:any
    const reply={
      status(_code:number){return reply},
      json(body:any){payload=body;return reply},
    } as unknown as Response
    await courseController.create({
      user:{userId:legacyUser.id,username:legacyUser.username,role:legacyUser.role,
        accountDomain:'LEGACY'},body:{title:'新培训课程'},query:{},
    } as unknown as Request,reply)
    expect(payload?.code).toBe(0)
    expect(payload.data.courseType).toBe('TRAINING_COURSE')
    const f=await fixture()
    await expect(db.course.create({data:{
      title:'Forbidden training',creatorId:f.admin.userId,
      courseCode:userName('badtraining_'),
    }})).rejects.toThrow()
    await expect(db.course.create({data:{
      title:'Wrong school',creatorId:legacyUser.id,
      courseCode:userName('badcampus_'),
      courseType:'CAMPUS_ACTIVITY',organizationId:f.organizationId,
      isRecruiting:false,
    }})).rejects.toThrow()
    expect((await db.course.findUnique({where:{id:old.id}}))?.courseType).toBe('LEGACY_COURSE')
  })

  it('requires school approval, selects exactly one participant and gates homework on OPEN/PAUSE',async()=>{
    const f=await fixture()
    const activity=await createCampusActivity({
      actor:f.admin,organizationId:f.organizationId,
      title:'心理安全感与班级支持',purpose:'STUDENT_WELLBEING',
    })
    const state={actor:f.admin,organizationId:f.organizationId,courseId:activity.id}
    await expect(changeCampusActivityStatus({
      ...state,action:'OPEN',expectedVersion:activity.version,
    })).rejects.toMatchObject({code:'ACTIVITY_STATE_CONFLICT'})
    await addCampusActivityTask({...state,kind:'READING',title:'阅读班级支持指南'})
    const allocation={...state,
      classUnitIds:[f.classUnitId],requestKey:'campus-test-'+randomUUID(),
      expectedVersion:activity.version,
    }
    const first=await allocateCampusActivityParticipants(allocation)
    expect(first).toMatchObject({selected:1,replayed:false})
    expect(await allocateCampusActivityParticipants(allocation)).toMatchObject({
      selected:1,replayed:true,
    })
    await expect(changeCampusActivityStatus({...state,actor:f.student,
      action:'OPEN',expectedVersion:activity.version,
    })).rejects.toMatchObject({code:'ACTIVITY_GOVERNANCE_REQUIRED'})
    const submitted=await changeCampusActivityStatus({...state,
      action:'SUBMIT',expectedVersion:activity.version,
    })
    expect(submitted).toMatchObject({status:'SUBMITTED',version:2})
    const before=await listCampusStudentTasks(f.student,{page:1,pageSize:20})
    expect(before.list).toHaveLength(0)
    const opened=await changeCampusActivityStatus({...state,action:'OPEN',expectedVersion:2})
    expect(opened.status).toBe('OPEN')
    const active=await listCampusStudentTasks(f.student,{page:1,pageSize:20})
    expect(active.list).toHaveLength(1)
    expect(active.list[0]).toMatchObject({kind:'READING',status:'PENDING',activityId:activity.id})
    expect(await hasActiveCourseMembership(activity.id,f.student.userId)).toBe(true)
    const paused=await changeCampusActivityStatus({...state,action:'PAUSE',expectedVersion:3})
    expect(paused.status).toBe('PAUSED')
    expect((await listCampusStudentTasks(f.student,{page:1,pageSize:20})).list).toHaveLength(0)
    expect(await hasActiveCourseMembership(activity.id,f.student.userId)).toBe(false)
    const resumed=await changeCampusActivityStatus({...state,action:'RESUME',expectedVersion:4})
    expect(resumed.status).toBe('OPEN')
    await changeCampusActivityStatus({...state,action:'CLOSE',expectedVersion:5})
    expect((await listCampusStudentTasks(f.student,{page:1,pageSize:20})).list).toHaveLength(0)
  })

  it('does not disclose CAMPUS Activity assignments, checkins or tags to a legacy platform ADMIN',async()=>{
    const f=await fixture()
    const activity=await createCampusActivity({
      actor:f.admin,organizationId:f.organizationId,
      title:'校内敏感活动',purpose:'STUDENT_WELLBEING',
    })
    const school={
      actor:f.admin,organizationId:f.organizationId,courseId:activity.id,
    }
    const assignment=await addCampusActivityTask({
      ...school,kind:'READING',title:'校内课程专属阅读',
    })
    const checkin=await addCampusActivityTask({
      ...school,kind:'CHECKIN',title:'校内活动记录',
    })
    const campusTag='campus-private-'+randomUUID().slice(0,8)
    await db.checkin.update({where:{id:checkin.id},data:{tags:[campusTag]}})
    const legacy=await db.user.create({data:{
      username:userName('legacy_admin_'),passwordHash:'synthetic-only',
      accountDomain:'LEGACY',role:UserRole.ADMIN,
    }})
    const request={
      user:{userId:legacy.id,username:legacy.username,role:legacy.role,
        accountDomain:'LEGACY',platformRole:'STANDARD'},
      query:{},
    } as unknown as Request
    const readResponse=()=>{
      let value:any
      const res={
        json(payload:any){value=payload;return res},
        status(_code:number){return res},
      } as unknown as Response
      return {res,read:()=>value}
    }
    const ar=readResponse()
    await assignmentController.list(request,ar.res)
    expect(ar.read().code).toBe(0)
    expect(ar.read().data.list.some((x:{id:string})=>x.id===assignment.id)).toBe(false)
    const cr=readResponse()
    await checkinController.list(request,cr.res)
    expect(cr.read().code).toBe(0)
    expect(cr.read().data.list.some((x:{id:string})=>x.id===checkin.id)).toBe(false)
    const at=readResponse()
    await assignmentController.getTags(request,at.res)
    expect(at.read().data.tags).not.toContain('CAMPUS_READING')
    const ct=readResponse()
    await checkinController.getTags(request,ct.res)
    expect(ct.read().data.tags).not.toContain(campusTag)
  })

  it('cannot open an Activity using frozen identities or revoked STUDENT persona',async()=>{
    const f=await fixture()
    const activity=await createCampusActivity({
      actor:f.admin,organizationId:f.organizationId,
      title:'验证成员状态',purpose:'STUDENT_WELLBEING',
    })
    const state={actor:f.admin,organizationId:f.organizationId,courseId:activity.id}
    await addCampusActivityTask({...state,kind:'ASSIGNMENT',title:'练习'})
    await allocateCampusActivityParticipants({
      ...state,classUnitIds:[f.classUnitId],
      requestKey:'freeze-'+randomUUID(),expectedVersion:activity.version,
    })
    const submitted=await changeCampusActivityStatus({
      ...state,action:'SUBMIT',expectedVersion:activity.version,
    })
    await db.user.update({where:{id:f.student.userId},data:{
      isFrozen:true,tokenVersion:{increment:1},
    }})
    await expect(changeCampusActivityStatus({
      ...state,action:'OPEN',expectedVersion:submitted.version,
    })).rejects.toMatchObject({code:'ACTIVITY_NOT_READY'})
    expect(await hasActiveCourseMembership(activity.id,f.student.userId)).toBe(false)
    expect((await listCampusStudentTasks(f.student,{page:1,pageSize:20})).list).toHaveLength(0)
  })

  it('rejects delayed Assignment and Checkin submissions after STUDENT persona revocation',async()=>{
    const f=await fixture()
    const activity=await createCampusActivity({
      actor:f.admin,organizationId:f.organizationId,
      title:'身份撤销提交验证',purpose:'STUDENT_WELLBEING',
    })
    const state={actor:f.admin,organizationId:f.organizationId,courseId:activity.id}
    const assignment=await addCampusActivityTask({
      ...state,kind:'ASSIGNMENT',title:'校园练习',
    })
    const checkin=await addCampusActivityTask({
      ...state,kind:'CHECKIN',title:'每日记录',
    })
    await allocateCampusActivityParticipants({
      ...state,classUnitIds:[f.classUnitId],
      requestKey:'revoked-persona-'+randomUUID(),expectedVersion:1,
    })
    await changeCampusActivityStatus({...state,action:'SUBMIT',expectedVersion:1})
    await changeCampusActivityStatus({...state,action:'OPEN',expectedVersion:2})
    const studentGrant=await db.organizationPersonaGrant.findFirstOrThrow({
      where:{organizationId:f.organizationId,membershipId:f.studentMember,persona:'STUDENT',revokedAt:null},
    })
    await db.organizationPersonaGrant.update({
      where:{id:studentGrant.id},data:{revokedAt:new Date()},
    })
    expect(await hasActiveCourseMembership(activity.id,f.student.userId)).toBe(false)
    expect((await listCampusStudentTasks(f.student,{page:1,pageSize:20})).list).toHaveLength(0)
    await expect(db.submission.create({data:{
      assignmentId:assignment.id,studentId:f.student.userId,
      content:'This write must be rejected',status:'SUBMITTED',
    }})).rejects.toThrow()
    await expect(db.checkinSubmission.create({data:{
      checkinId:checkin.id,studentId:f.student.userId,
      content:'This check-in must be rejected',
    }})).rejects.toThrow()
  })

  it('creates canonical Run drafts atomically, but forbids publication before governing Activity OPEN',async()=>{
    const f=await fixture()
    const a=await createCampusActivity({
      actor:f.admin,organizationId:f.organizationId,title:'关系观察',
      purpose:'SCHOOL_CLIMATE',
    })
    await allocateCampusActivityParticipants({
      actor:f.admin,organizationId:f.organizationId,courseId:a.id,
      classUnitIds:[f.classUnitId],requestKey:'run-alloc-'+randomUUID(),expectedVersion:1,
    })
    const run=await createCampusActivityRunDraft({
      actor:f.admin,organizationId:f.organizationId,courseId:a.id,
      name:'关系测量 V1',
    })
    expect(run.status).toBe('DRAFT')
    const bind=await db.$queryRaw<Array<{courseId:string}>>`
      SELECT "course_id" AS "courseId" FROM "campus_activity_runs"
      WHERE "run_id"=${run.id}
    `
    expect(bind[0]?.courseId).toBe(a.id)
    await expect(db.$transaction(tx=>campusRunParticipantScope(tx,{
      organizationId:f.organizationId,runId:run.id,
      actorUserId:f.admin.userId,publish:true,
    }))).rejects.toMatchObject({code:'CAMPUS_RUN_REQUIRES_OPEN_GOVERNED_ACTIVITY'})
    const selected=await db.$transaction(tx=>campusRunParticipantScope(tx,{
      organizationId:f.organizationId,runId:run.id,
      actorUserId:f.admin.userId,publish:false,
    }))
    expect(selected?.has(f.studentMember)).toBe(true)
  })

  it('rejects an actor from another SCHOOL trying to allocate and view a private Activity',async()=>{
    const a=await fixture(),b=await fixture()
    const activity=await createCampusActivity({
      actor:a.admin,organizationId:a.organizationId,title:'独立校园活动',
      purpose:'STUDENT_WELLBEING',
    })
    await expect(allocateCampusActivityParticipants({
      actor:b.admin,organizationId:a.organizationId,courseId:activity.id,
      classUnitIds:[a.classUnitId],requestKey:'external-'+randomUUID(),expectedVersion:1,
    })).rejects.toMatchObject({code:'SCHOOL_MEMBERSHIP_REQUIRED'})
    const result=await listCampusStudentTasks(b.student,{page:1,pageSize:20,activityId:activity.id})
    expect(result.list).toHaveLength(0)
  })
})
