import {grantSyntheticHuischoolProduct} from './educationProductFixture'
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
  createCampusActivity,changeCampusActivityStatus,CampusActivityError,addCampusActivityCollaborator,readCampusActivity,
} from '../../modules/campus/activity.service'
import { allocateCampusActivityParticipants,listCampusActivityEligibleClasses } from '../../modules/campus/activity.allocation'
import { addCampusActivityTask,listCampusStudentTasks } from '../../modules/campus/activity.tasks'
import { assignmentController } from '../../controllers/assignmentController'
import { courseController } from '../../controllers/courseController'
import { checkinController } from '../../controllers/checkinController'
import type { Request, Response } from 'express'
import { createCampusActivityRunDraft,assertCampusActivityRunPublisher } from '../../modules/campus/activity.runs'
import { addAssessmentRunTrackDraft } from '../../modules/assessment-run/repository'
import { publishAssessmentRun,previewAssessmentRun } from '../../modules/assessment-run/publish'
import { closeAssessmentRun,cancelAssessmentRun } from '../../modules/assessment-run/lifecycle'
import { RunResourceAuthorityRegistry,type RunResourceAuthorityAdapter } from '../../modules/assessment-run/resourceAuthority'
import { canonicalHash } from '../../modules/assessment-runtime/canonical'
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
async function fixture(studentCount=1){
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
  await grantSyntheticHuischoolProduct(db,{
    organizationId:organization.id,adminUserId:admin.id,adminMembershipId:adminMember.id,
  })
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
  const studentNumbers=Array.from({length:studentCount},()=> 'S'+randomUUID().slice(0,8))
  const roster=await replaceCampusRoster({
    actor:actor(admin),organizationId:organization.id,classUnitId:cls.id,
    studentNumbers,
  })
  await setCampusRegistrationWindow({
    actor:actor(admin),organizationId:organization.id,classUnitId:cls.id,
    action:'OPEN',closesAt:new Date(Date.now()+40*60_000),
  })
  const code=await issueCampusActivationCodes({
    actor:actor(admin),organizationId:organization.id,classUnitId:cls.id,
    count:studentCount,ttlMinutes:35,
  })
  const students=[]
  for(const [index,studentNumber] of studentNumbers.entries())students.push(await registerCampusStudent({
    organizationId:organization.id,classUnitId:cls.id,
    studentNumber,activationCode:code.codes[index],
    username:userName('hs_participant_'),password:'SyntheticPassword123',
  }))
  const student=students[0]
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
  const studentMembers=await db.organizationMembership.findMany({where:{
    organizationId:organization.id,userId:{in:students.map(item=>item.userId)},validUntil:null,
  },select:{id:true,userId:true}})
  return {
    organizationId:organization.id,classUnitId:cls.id,
    admin:actor(admin),counselor:actor(counselor),
    student:actor(studentUser),studentMember:member.id,studentMembers,adminMember:adminMember.id,
  }
}
const psychologistPolicy={
  subjectRoles:['STUDENT'],respondentRoles:['STUDENT'],relationshipKinds:['SELF'],perspectives:['SELF_REPORT'],
  analysisMode:'INDIVIDUAL_ONLY',visibilityPolicyKey:'ORG_SELF_V1',minimumRespondents:null,
}
function psychologistRegistry(initiationModes:Array<'CLASS_ASSIGN'|'PROFESSIONAL_ASSIGN'>=['CLASS_ASSIGN']){
  const adapter:RunResourceAuthorityAdapter={
    family:'BUNDLE',capabilities:{transactionMode:'TRANSACTIONAL_DB',startMode:'TRANSACTIONAL',
      supportsLookupByOperationKey:false,supportsSafeCancel:true,finalAuthority:'CANONICAL_RUNTIME',
      runtimeBindingKind:'COMPOSITE',runV1Enabled:true},
    async resolveExact(ref){return {family:ref.family,key:ref.key,version:ref.version,
      scientificMaturity:'PILOT',applicabilityHash:canonicalHash({ref,psychologistPolicy}),
      ...psychologistPolicy,initiationModes,runtimeLaunchTarget:{kind:'COMPOSITE',ref:'synthetic-school-self'}}},
  }
  return new RunResourceAuthorityRegistry([adapter])
}
async function psychologistDraft(studentCount=1){
  const f=await fixture(studentCount)
  await db.user.update({where:{id:f.counselor.userId},data:{teacherApproved:true}})
  const member=await db.organizationMembership.findFirstOrThrow({where:{organizationId:f.organizationId,userId:f.counselor.userId}})
  const a=await createCampusActivity({actor:f.counselor,organizationId:f.organizationId,title:'本人心理活动',purpose:'STUDENT_WELLBEING'})
  const scope={actor:f.counselor,organizationId:f.organizationId,courseId:a.id}
  await allocateCampusActivityParticipants({...scope,classUnitIds:[f.classUnitId],requestKey:randomUUID(),expectedVersion:1})
  const run=await createCampusActivityRunDraft({...scope,name:'学生自评'})
  await addAssessmentRunTrackDraft({organizationId:f.organizationId,runId:run.id,
    resource:{family:'BUNDLE',key:'synthetic-school-psychology',version:'1.0.0'},
    subjectSelector:{kind:'MEMBERSHIP_IDS',membershipIds:f.studentMembers.map(item=>item.id)},
    respondentSelector:{kind:'MEMBERSHIP_IDS',membershipIds:f.studentMembers.map(item=>item.id)},requestedPolicy:psychologistPolicy})
  const detail=await readCampusActivity(scope)
  const submitted=await changeCampusActivityStatus({...scope,action:'SUBMIT',expectedVersion:detail.version})
  const publication={organizationId:f.organizationId,runId:run.id,actorUserId:f.counselor.userId,
    expectedVersion:2,resourceRegistry:psychologistRegistry()}
  return {f,scope,member,run,submitted,publication}
}

suite('Huischool Activity lifecycle, independent training boundary and task gate — isolated PostgreSQL',()=>{
  beforeAll(async()=>{
    process.env.CAMPUS_ELIGIBILITY_HMAC_KEY='56'.repeat(32)
    db=new PrismaClient({datasources:{db:{url:DB_URL!}}})
    await db.$connect()
  })
  afterAll(async()=>{await db?.$disconnect()})

  it('publishes own psychologist activity with CLASS_ASSIGN without TEACHER persona and safely closes its batch',async()=>{
    const {f,scope,member,run,submitted,publication}=await psychologistDraft()
    expect(await db.organizationPersonaGrant.count({where:{membershipId:member.id,persona:'TEACHER'}})).toBe(0)
    expect(await db.$queryRaw`SELECT count(*)::int AS "count" FROM "organization_staff_class_assignments"
      WHERE "membership_id"=${member.id}`).toEqual([{count:0}])
    expect(await db.organizationPersonaGrant.count({where:{membershipId:f.studentMember,persona:'CLIENT'}})).toBe(0)
    const before=await readCampusActivity(scope)
    expect(before.capabilities).toMatchObject({canOpen:true,ownPsychologyPublisher:true})
    expect((await previewAssessmentRun(publication)).tracks[0].executionCount).toBe(1)
    await expect(publishAssessmentRun(publication)).rejects.toMatchObject({code:'CAMPUS_RUN_REQUIRES_OPEN_GOVERNED_ACTIVITY'})
    const opened=await changeCampusActivityStatus({...scope,action:'OPEN',expectedVersion:submitted.version})
    expect(await publishAssessmentRun(publication)).toMatchObject({executionCount:1})
    const detail=await readCampusActivity(scope)
    expect(detail.runs[0].capabilities).toMatchObject({canPublish:false,canClose:true,canCancel:true})
    const paused=await changeCampusActivityStatus({...scope,action:'PAUSE',expectedVersion:opened.version})
    await expect(db.$transaction(tx=>campusRunParticipantScope(tx,{...publication,publish:true}))).rejects.toBeInstanceOf(CampusActivityError)
    await changeCampusActivityStatus({...scope,action:'RESUME',expectedVersion:paused.version})
    await expect(closeAssessmentRun({organizationId:f.organizationId,runId:run.id,
      schoolActivity:{actor:f.counselor,courseId:scope.courseId}})).resolves.toEqual({status:'CLOSED'})
    expect(await db.educationProductRoleGrant.count({where:{membershipId:member.id}})).toBe(0)
  })

  it('does not substitute all school students when an activity has no selected population',async()=>{
    const {scope,submitted,publication}=await psychologistDraft()
    await db.$executeRaw`UPDATE "campus_activity_participants" SET "status"='REVOKED',"revoked_at"=clock_timestamp()
      WHERE "course_id"=${scope.courseId}`
    await expect(previewAssessmentRun(publication)).rejects.toMatchObject({code:'ACTIVITY_PUBLISH_CLASS_SCOPE'})
    await expect(changeCampusActivityStatus({...scope,action:'OPEN',expectedVersion:submitted.version}))
      .rejects.toMatchObject({code:'ACTIVITY_PUBLISH_CLASS_SCOPE'})
  })

  it('rejects an entire reviewed two-student population after one account expires instead of publishing one',async()=>{
    const {f,scope,run,submitted,publication}=await psychologistDraft(2)
    await changeCampusActivityStatus({...scope,action:'OPEN',expectedVersion:submitted.version})
    expect((await previewAssessmentRun(publication)).tracks[0].executionCount).toBe(2)
    await db.$executeRaw`UPDATE "users" SET "expires_at"=clock_timestamp()-interval '1 second'
      WHERE "id"=${f.studentMembers[0].userId}`
    await expect(publishAssessmentRun(publication)).rejects.toMatchObject({code:'ACTIVITY_PUBLISH_CLASS_SCOPE'})
    const rows=await db.$queryRaw<Array<{status:string;count:number}>>`
      SELECT r."status",(SELECT count(*)::int FROM "assessment_run_executions" e WHERE e."run_id"=r."id") AS "count"
      FROM "assessment_runs" r WHERE r."id"=${run.id}`
    expect(rows).toEqual([{status:'DRAFT',count:0}])
  })

  it('rejects withdrawn class approval at OPEN and publish, while retaining administrator emergency stop',async()=>{
    const {f,scope,member,run,submitted,publication}=await psychologistDraft()
    await db.$executeRaw`UPDATE "campus_class_admissions" SET "status"='CLOSED'
      WHERE "organization_id"=${f.organizationId} AND "class_unit_id"=${f.classUnitId}`
    await expect(changeCampusActivityStatus({...scope,action:'OPEN',expectedVersion:submitted.version})).rejects.toMatchObject({code:'ACTIVITY_PUBLISH_CLASS_SCOPE'})
    await db.$executeRaw`UPDATE "campus_class_admissions" SET "status"='APPROVED'
      WHERE "organization_id"=${f.organizationId} AND "class_unit_id"=${f.classUnitId}`
    const opened=await changeCampusActivityStatus({...scope,action:'OPEN',expectedVersion:submitted.version})
    await db.$executeRaw`UPDATE "campus_class_admissions" SET "status"='CLOSED'
      WHERE "organization_id"=${f.organizationId} AND "class_unit_id"=${f.classUnitId}`
    await expect(publishAssessmentRun(publication)).rejects.toMatchObject({code:'ACTIVITY_PUBLISH_CLASS_SCOPE'})
    await db.$executeRaw`UPDATE "organization_capability_grants" SET "revoked_at"=clock_timestamp()
      WHERE "membership_id"=${member.id} AND "capability"='PSYCHOLOGY_STAFF'`
    await expect(assertCampusActivityRunPublisher({...scope,runId:run.id})).rejects.toMatchObject({code:'ACTIVITY_PUBLISHER_REQUIRED'})
    await expect(changeCampusActivityStatus({...scope,action:'PAUSE',expectedVersion:opened.version})).rejects.toMatchObject({code:'ACTIVITY_GOVERNANCE_REQUIRED'})
    await expect(changeCampusActivityStatus({...scope,actor:f.admin,action:'PAUSE',expectedVersion:opened.version})).resolves.toMatchObject({status:'PAUSED'})
  })

  it('does not let collaborator-only ownership, foreign actors or professional-only resource policy publish students',async()=>{
    const {f,scope,member,run,submitted,publication}=await psychologistDraft()
    const other=await fixture()
    await expect(assertCampusActivityRunPublisher({...scope,actor:other.counselor,runId:run.id})).rejects.toThrow()
    await changeCampusActivityStatus({...scope,action:'OPEN',expectedVersion:submitted.version})
    await expect(previewAssessmentRun({...publication,resourceRegistry:psychologistRegistry(['PROFESSIONAL_ASSIGN'])})).rejects.toMatchObject({code:'RUN_INITIATION_FORBIDDEN'})
    await db.$executeRaw`UPDATE "campus_activities" SET "owner_membership_id"=${f.adminMember} WHERE "course_id"=${scope.courseId}`
    await db.$executeRaw`INSERT INTO "campus_activity_collaborators" ("course_id","organization_id","membership_id")
      VALUES (${scope.courseId},${f.organizationId},${member.id})`
    await expect(assertCampusActivityRunPublisher({...scope,runId:run.id})).rejects.toMatchObject({code:'ACTIVITY_PUBLISHER_REQUIRED'})
    await expect(publishAssessmentRun(publication)).rejects.toThrow()
  })

  it('rechecks psychologist qualification in close/cancel transactions and preserves admin cancellation',async()=>{
    const {f,scope,member,run,submitted,publication}=await psychologistDraft()
    await changeCampusActivityStatus({...scope,action:'OPEN',expectedVersion:submitted.version})
    await publishAssessmentRun(publication)
    await assertCampusActivityRunPublisher({...scope,runId:run.id})
    await db.$executeRaw`UPDATE "organization_capability_grants" SET "revoked_at"=clock_timestamp()
      WHERE "membership_id"=${member.id} AND "capability"='PSYCHOLOGY_STAFF'`
    const lifecycle={organizationId:f.organizationId,runId:run.id,schoolActivity:{actor:f.counselor,courseId:scope.courseId}}
    await expect(closeAssessmentRun(lifecycle)).rejects.toMatchObject({code:'ACTIVITY_PUBLISHER_REQUIRED'})
    await expect(cancelAssessmentRun(lifecycle)).rejects.toMatchObject({code:'ACTIVITY_PUBLISHER_REQUIRED'})
    await expect(cancelAssessmentRun({...lifecycle,schoolActivity:{actor:f.admin,courseId:scope.courseId}})).resolves.toEqual({status:'CANCELLED'})
  })

  it('lists only current allocatable class names for activity editors and rechecks scope at allocation',async()=>{
    const f=await fixture()
    const other=await fixture()
    const activity=await createCampusActivity({actor:f.admin,organizationId:f.organizationId,
      title:'Scoped class picker',purpose:'SCHOOL_CLIMATE'})
    const input={actor:f.admin,organizationId:f.organizationId,courseId:activity.id}
    const grade=await createOrganizationUnit({organizationId:f.organizationId,unitKind:'GRADE',name:'目录年级'})
    const extra=await createOrganizationUnit({organizationId:f.organizationId,unitKind:'CLASS',name:'其他获批班级',parentUnitId:grade.id})
    const pending=await createOrganizationUnit({organizationId:f.organizationId,unitKind:'CLASS',name:'未审批班级',parentUnitId:grade.id})
    await db.campusClassAdmission.createMany({data:[
      {organizationId:f.organizationId,classUnitId:extra.id,status:'APPROVED'},
      {organizationId:f.organizationId,classUnitId:pending.id,status:'DRAFT'},
    ]})
    const adminList=await listCampusActivityEligibleClasses(input)
    expect(adminList.list.map(row=>row.id).sort()).toEqual([f.classUnitId,extra.id].sort())
    expect(adminList.list.every(row=>Object.keys(row).sort().join(',')==='id,name')).toBe(true)
    expect(adminList.list.some(row=>row.id===other.classUnitId)).toBe(false)
    await expect(listCampusActivityEligibleClasses({...input,actor:other.admin})).rejects.toBeInstanceOf(CampusActivityError)
    await expect(listCampusActivityEligibleClasses({...input,organizationId:other.organizationId})).rejects.toBeInstanceOf(CampusActivityError)

    await db.user.update({where:{id:f.counselor.userId},data:{teacherApproved:true}})
    const psych=await db.organizationMembership.findFirstOrThrow({where:{userId:f.counselor.userId,organizationId:f.organizationId}})
    await addCampusActivityCollaborator({...input,membershipId:psych.id})
    // Qualified psychology membership can select this school's approved classes, without TEACHER.
    expect((await listCampusActivityEligibleClasses({...input,actor:f.counselor})).list.map(row=>row.id).sort()).toEqual([f.classUnitId,extra.id].sort())
    await expect(allocateCampusActivityParticipants({...input,actor:f.counselor,
      classUnitIds:[other.classUnitId],requestKey:randomUUID(),expectedVersion:1,
    })).rejects.toMatchObject({code:'ACTIVITY_CLASS_NOT_APPROVED'})
    const teacher=await db.user.create({data:{username:userName('class_teacher_'),passwordHash:'synthetic-only',accountDomain:'SCHOOL',role:'TEACHER'}})
    const teacherMember=await db.organizationMembership.create({data:{id:randomUUID(),organizationId:f.organizationId,userId:teacher.id,orgRole:'MEMBER'}})
    for(const membershipId of [teacherMember.id]){
      await db.organizationPersonaGrant.create({data:{id:randomUUID(),organizationId:f.organizationId,membershipId,persona:'TEACHER',grantedByUserId:f.admin.userId}})
    }
    await addCampusActivityCollaborator({...input,membershipId:teacherMember.id})
    await expect(listCampusActivityEligibleClasses({...input,actor:actor(teacher)})).rejects.toMatchObject({code:'ACTIVITY_EDITOR_REQUIRED'})
    for(const membershipId of [teacherMember.id]){
      for(const [classId,from,until] of [
        [f.classUnitId,new Date(Date.now()-60_000),null],
        [pending.id,new Date(Date.now()-60_000),null],
        [extra.id,new Date(Date.now()-120_000),new Date(Date.now()-60_000)],
        [extra.id,new Date(Date.now()+60_000),null],
      ] as const){
        await db.$executeRaw`INSERT INTO "organization_staff_class_assignments"
          ("id","organization_id","membership_id","class_unit_id","staff_role","valid_from","valid_until")
          VALUES (${randomUUID()},${f.organizationId},${membershipId},${classId},'TEACHING',${from},${until})`
      }
    }
    expect((await listCampusActivityEligibleClasses({...input,actor:actor(teacher)})).list.map(row=>row.id)).toEqual([f.classUnitId])
    expect((await listCampusActivityEligibleClasses({...input,actor:f.counselor})).list.map(row=>row.id).sort()).toEqual([f.classUnitId,extra.id].sort())
    // A previously successful GET is not permission to allocate after professional withdrawal.
    await db.$executeRaw`UPDATE "organization_capability_grants" SET "revoked_at"=clock_timestamp()
      WHERE "organization_id"=${f.organizationId} AND "membership_id"=${psych.id}
        AND "capability"='PSYCHOLOGY_STAFF' AND "revoked_at" IS NULL`
    await expect(listCampusActivityEligibleClasses({...input,actor:f.counselor})).rejects.toMatchObject({code:'ACTIVITY_EDITOR_REQUIRED'})
    await expect(allocateCampusActivityParticipants({...input,actor:f.counselor,
      classUnitIds:[f.classUnitId],requestKey:'picker-'+randomUUID(),expectedVersion:1,
    })).rejects.toMatchObject({code:'ACTIVITY_EDITOR_REQUIRED'})
    await expect(createCampusActivity({actor:f.counselor,organizationId:f.organizationId,title:'COUNSELOR alone',purpose:'STUDENT_WELLBEING'}))
      .rejects.toMatchObject({code:'ACTIVITY_EDITOR_REQUIRED'})
    await db.organizationMembership.update({where:{id:teacherMember.id},data:{validUntil:new Date()}})
    await expect(listCampusActivityEligibleClasses({...input,actor:actor(teacher)})).rejects.toBeInstanceOf(CampusActivityError)
    await changeCampusActivityStatus({...input,action:'SUBMIT',expectedVersion:1})
    await expect(listCampusActivityEligibleClasses(input)).rejects.toMatchObject({code:'ACTIVITY_ALLOCATION_FROZEN'})
  })

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

  it('keeps completed campus reading, practice and checkin immutable across concurrent and stale requests',async()=>{
    const f=await fixture()
    const activity=await createCampusActivity({actor:f.admin,organizationId:f.organizationId,title:'重复提交隔离回归',purpose:'STUDENT_WELLBEING'})
    const scope={actor:f.admin,organizationId:f.organizationId,courseId:activity.id}
    const tasks:Array<Awaited<ReturnType<typeof addCampusActivityTask>>>=[]
    for(const kind of ['READING','ASSIGNMENT','CHECKIN'] as const)
      tasks.push(await addCampusActivityTask({...scope,kind,title:'独立任务 '+kind}))
    const next=await addCampusActivityTask({...scope,kind:'CHECKIN',title:'下一次活动记录'})
    await allocateCampusActivityParticipants({...scope,classUnitIds:[f.classUnitId],requestKey:randomUUID(),expectedVersion:1})
    await changeCampusActivityStatus({...scope,action:'SUBMIT',expectedVersion:1})
    await changeCampusActivityStatus({...scope,action:'OPEN',expectedVersion:2})
    const submit=async(task:typeof tasks[number],content:string,key?:string)=>{
      let status=200,value:any
      const res={status(code:number){status=code;return res},json(payload:any){value=payload;return res}} as unknown as Response
      const req={user:f.student,params:{id:task.id},body:{content},header:()=>key} as unknown as Request
      await (task.kind==='CHECKIN'?checkinController:assignmentController).submit(req,res)
      return {status,value}
    }
    for(const task of tasks){
      const results=await Promise.all([submit(task,'first A'),submit(task,'first B')])
      expect(results.map(r=>r.status).sort()).toEqual([200,409])
      const read=()=>task.kind==='CHECKIN'
        ?db.checkinSubmission.findUniqueOrThrow({where:{checkinId_studentId:{checkinId:task.id,studentId:f.student.userId}}})
        :db.submission.findUniqueOrThrow({where:{assignmentId_studentId:{assignmentId:task.id,studentId:f.student.userId}}})
      const original=await read()
      expect(original.revision).toBe(1)
      expect((await submit(task,'changed from old tab')).status).toBe(409)
      expect((await submit(task,original.content??'',randomUUID())).status).toBe(409)
      expect(await read()).toEqual(original)
      if(task.kind!=='CHECKIN'){
        expect(await db.submissionHistory.count({where:{submissionId:original.id}})).toBe(0)
        // A migrated legacy row can still be revision zero: the final status is authoritative.
        await db.submission.update({where:{id:original.id},data:{revision:0}})
        expect((await submit(task,'overwrite migrated final')).status).toBe(409)
        expect((await read()).content).toBe(original.content)
      }
    }
    // A separate occurrence remains a legal new task, with exact-key retry reusing its receipt.
    const keyed={...next,kind:'CHECKIN' as const},key=randomUUID()
    const first=await submit(keyed,'new occurrence',key)
    expect(first.status).toBe(200)
    expect((await submit(keyed,'new occurrence',key)).value.data.id).toBe(first.value.data.id)
    expect((await submit(keyed,'changed occurrence',key)).status).toBe(409)
    expect(await db.checkinSubmission.count({where:{checkinId:next.id,studentId:f.student.userId}})).toBe(1)
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
