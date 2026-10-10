import { randomUUID } from 'node:crypto'
import { describe,it,expect,beforeAll,afterAll } from 'vitest'
import { PrismaClient, UserRole } from '@prisma/client'
import { integrationDatabaseUrl } from './integration-env'
import { createOrganizationUnit } from '../../modules/organization/structure'
import { LINK_CONSENT_VERSION } from '../../modules/parent-portal/contracts'
import {
  replaceCampusRoster,setCampusRegistrationWindow,issueCampusActivationCodes,
  registerCampusStudent,approveCampusClass,
} from '../../modules/campus/admission.service'
import { createCampusActivity,changeCampusActivityStatus } from '../../modules/campus/activity.service'
import { addCampusActivityTask } from '../../modules/campus/activity.tasks'
import { allocateCampusActivityParticipants } from '../../modules/campus/activity.allocation'
import {
  createCampusParentInvitation,registerCampusParent,
  approveCampusParentLink,revokeCampusParentLink,readCampusParentLinks,
} from '../../modules/campus/parent.service'
import {
  studentPeerConsent,guardianPeerConsent,allocateCampusPeers,
  myCampusPeerTargets,guardianPeerRequests,campusPeerOpportunities,
} from '../../modules/campus/peer.service'
import type { AuthenticatedPrincipal } from '../../types'

const URL=integrationDatabaseUrl('RELEASE_INTEGRATION_DATABASE_URL','PR26_INTEGRATION_DATABASE_URL')
const suite=URL?describe:describe.skip
let db:PrismaClient
const label=(prefix:string)=>prefix+randomUUID().replace(/-/g,'')
const principal=(u:{id:string;role:UserRole;username:string}):AuthenticatedPrincipal=>({
  userId:u.id,role:u.role,username:u.username,
  accountDomain:'SCHOOL',platformRole:'STANDARD',tokenVersion:0,mustChangePassword:false,
})
async function setupSchool(count=5){
  const admin=await db.user.create({data:{
    username:label('hs_admin_'),accountDomain:'SCHOOL',passwordHash:'synthetic',
    role:'ADMIN',
  }})
  const org=await db.organization.create({data:{
    id:randomUUID(),name:label('School_'),productDomain:'SCHOOL',createdByUserId:admin.id,
  }})
  await db.organizationMembership.create({data:{
    id:randomUUID(),organizationId:org.id,userId:admin.id,orgRole:'ORG_ADMIN',
  }})
  const grade=await createOrganizationUnit({
    organizationId:org.id,unitKind:'GRADE',name:'初一年级',
  })
  const classroom=await createOrganizationUnit({
    organizationId:org.id,unitKind:'CLASS',name:'互评班',parentUnitId:grade.id,
  })
  const psych=await db.user.create({data:{
    username:label('hs_psych_'),accountDomain:'SCHOOL',passwordHash:'synthetic',
    role:'TEACHER',
  }})
  const membership=await db.organizationMembership.create({data:{
    id:randomUUID(),organizationId:org.id,userId:psych.id,orgRole:'MEMBER',
  }})
  await db.organizationPersonaGrant.create({data:{
    id:randomUUID(),organizationId:org.id,membershipId:membership.id,
    persona:'COUNSELOR',grantedByUserId:admin.id,
  }})
  await db.organizationCapabilityGrant.create({data:{
    id:randomUUID(),organizationId:org.id,membershipId:membership.id,
    capability:'PSYCHOLOGY_STAFF',grantedByUserId:admin.id,
  }})
  const numbers=Array.from({length:count},(_,i)=>'N'+randomUUID().slice(0,10)+i)
  const roster=await replaceCampusRoster({
    actor:principal(admin),organizationId:org.id,classUnitId:classroom.id,
    studentNumbers:numbers,
  })
  await setCampusRegistrationWindow({
    actor:principal(admin),organizationId:org.id,classUnitId:classroom.id,
    action:'OPEN',closesAt:new Date(Date.now()+3600_000),
  })
  const codes=await issueCampusActivationCodes({
    actor:principal(admin),organizationId:org.id,classUnitId:classroom.id,
    count,ttlMinutes:30,
  })
  const students:AuthenticatedPrincipal[]=[]
  for(let i=0;i<count;i++){
    const student=await registerCampusStudent({
      organizationId:org.id,classUnitId:classroom.id,
      studentNumber:numbers[i],activationCode:codes.codes[i],
      username:label('hs_student_'),password:'SyntheticStudent123',
    })
    const user=await db.user.findUniqueOrThrow({where:{id:student.userId}})
    students.push(principal(user))
  }
  await setCampusRegistrationWindow({actor:principal(admin),organizationId:org.id,
    classUnitId:classroom.id,action:'CLOSE'})
  await approveCampusClass({actor:principal(psych),organizationId:org.id,
    classUnitId:classroom.id,expectedRosterVersion:roster.rosterVersion})
  const activity=await createCampusActivity({actor:principal(admin),organizationId:org.id,
    title:'自愿同伴互评',purpose:'SCHOOL_CLIMATE'})
  await addCampusActivityTask({actor:principal(admin),organizationId:org.id,
    courseId:activity.id,kind:'READING',title:'同意政策阅读'})
  await allocateCampusActivityParticipants({actor:principal(admin),organizationId:org.id,
    courseId:activity.id,classUnitIds:[classroom.id],
    requestKey:'guardian-'+randomUUID(),expectedVersion:1})
  await changeCampusActivityStatus({actor:principal(admin),organizationId:org.id,
    courseId:activity.id,action:'SUBMIT',expectedVersion:1})
  await changeCampusActivityStatus({actor:principal(admin),organizationId:org.id,
    courseId:activity.id,action:'OPEN',expectedVersion:2})
  return {admin:principal(admin),students,organizationId:org.id,
    classUnitId:classroom.id,courseId:activity.id}
}

suite('Campus parent identity / peer consent and cohort constraints — isolated PostgreSQL',()=>{
  beforeAll(async()=>{
    process.env.CAMPUS_ELIGIBILITY_HMAC_KEY='73'.repeat(32)
    db=new PrismaClient({datasources:{db:{url:URL!}}});await db.$connect()
  })
  afterAll(async()=>{await db?.$disconnect()})

  it('creates a separate SCHOOL parent only once and leaves reports ungranted until student approval',async()=>{
    const f=await setupSchool(1)
    const invitation=await createCampusParentInvitation(f.students[0],f.organizationId)
    const login=label('parent_')
    const first=await registerCampusParent({
      inviteCode:invitation.inviteCode,username:login,
      password:'SyntheticGuardian123',guardianAcknowledged:true,
    })
    expect(first).toMatchObject({
      accountDomain:'SCHOOL',status:'PENDING_STUDENT_CONFIRMATION',
    })
    await expect(registerCampusParent({
      inviteCode:invitation.inviteCode,username:label('second_parent_'),
      password:'SyntheticGuardian123',guardianAcknowledged:true,
    })).rejects.toMatchObject({code:'CAMPUS_PARENT_LINK_UNAVAILABLE'})
    const alias=await db.campusAccount.findUniqueOrThrow({
      where:{normalizedLogin:login.toLowerCase()},include:{user:true},
    })
    expect(alias.user.role).toBe('PARENT')
    expect(alias.user.accountDomain).toBe('SCHOOL')
    expect(await db.organizationMembership.count({where:{
      organizationId:f.organizationId,userId:alias.userId,
    }})).toBe(0)
    const pending=await readCampusParentLinks(f.students[0])
    expect(pending.list).toHaveLength(1)
    expect(pending.list[0].status).toBe('PENDING')
    const reportGrants=await db.$queryRaw<Array<{count:number}>>`
      SELECT COUNT(*)::int AS "count" FROM "parent_report_disclosure_grants"
      WHERE "parent_user_id"=${alias.userId}
    `
    expect(reportGrants[0]?.count).toBe(0)
    await approveCampusParentLink(f.students[0],pending.list[0].id,
      LINK_CONSENT_VERSION)
    const approved=await readCampusParentLinks(principal(alias.user))
    expect(approved.list[0].status).toBe('ACTIVE')
    await revokeCampusParentLink(f.students[0],pending.list[0].id,
      'school student revoked link')
    expect((await readCampusParentLinks(principal(alias.user))).list[0].status).toBe('REVOKED')
  })

  it('requires both student and active guardian consent, samples >=5 in one class, no self pair',async()=>{
    const f=await setupSchool(5)
    const parentAccounts:AuthenticatedPrincipal[]=[]
    const links:string[]=[]
    for(const student of f.students){
      const invite=await createCampusParentInvitation(student,f.organizationId)
      const parentName=label('guardian_')
      await registerCampusParent({inviteCode:invite.inviteCode,username:parentName,
        password:'SyntheticGuardian123',guardianAcknowledged:true})
      const user=await db.campusAccount.findUniqueOrThrow({
        where:{normalizedLogin:parentName.toLowerCase()},include:{user:true},
      })
      parentAccounts.push(principal(user.user))
      const relationships=await readCampusParentLinks(student)
      links.push(relationships.list[0].id)
      await approveCampusParentLink(student,relationships.list[0].id,
        LINK_CONSENT_VERSION)
      await studentPeerConsent({actor:student,organizationId:f.organizationId,
        courseId:f.courseId,action:'ASSENT'})
    }
    await expect(allocateCampusPeers({actor:f.admin,organizationId:f.organizationId,
      courseId:f.courseId,classUnitId:f.classUnitId,peersPerRespondent:2,
    })).rejects.toMatchObject({code:'CAMPUS_PEER_INCOMPLETE_CONSENT'})
    for(let i=0;i<parentAccounts.length;i++){
      await guardianPeerConsent({actor:parentAccounts[i],organizationId:f.organizationId,
        courseId:f.courseId,relationshipId:links[i],action:'CONSENT'})
    }
    const allocated=await allocateCampusPeers({actor:f.admin,organizationId:f.organizationId,
      courseId:f.courseId,classUnitId:f.classUnitId,peersPerRespondent:2})
    expect(allocated).toMatchObject({cohortSize:5,assignments:10,privacyFloor:5})
    const pairs=await db.$queryRaw<Array<{subjectId:string;respondentId:string;classId:string}>>`
      SELECT "subject_membership_id" AS "subjectId",
        "respondent_membership_id" AS "respondentId",
        "class_unit_id" AS "classId"
      FROM "campus_peer_assignments" WHERE "organization_id"=${f.organizationId}
        AND "course_id"=${f.courseId}
    `
    expect(pairs).toHaveLength(10)
    expect(pairs.every(row=>row.subjectId!==row.respondentId&&
      row.classId===f.classUnitId)).toBe(true)
    const assignedPeers=await myCampusPeerTargets({
      actor:f.students[0],organizationId:f.organizationId,courseId:f.courseId,
    })
    expect(assignedPeers.list).toHaveLength(2)
    expect(assignedPeers.ownAlias).toMatch(/^林-[A-F0-9]{10}$/)
    expect(assignedPeers.list.every(x=>/^林-[A-F0-9]{10}$/.test(x.peerAlias)
      && x.peerAlias!==assignedPeers.ownAlias)).toBe(true)
    await guardianPeerConsent({actor:parentAccounts[0],organizationId:f.organizationId,
      courseId:f.courseId,relationshipId:links[0],action:'WITHDRAW'})
    const remain=await db.$queryRaw<Array<{count:number}>>`
      SELECT COUNT(*)::int AS "count" FROM "campus_peer_assignments"
      WHERE "organization_id"=${f.organizationId} AND "course_id"=${f.courseId}
        AND "status"='ACTIVE'
    `
    expect(remain[0]?.count).toBeLessThan(10)
    expect((await guardianPeerRequests(parentAccounts[0])).list).toHaveLength(1)
    expect((await campusPeerOpportunities(f.students[0])).list).toHaveLength(1)
    // A school pause must NOT trap previously granted pupil consent.
    await changeCampusActivityStatus({
      actor:f.admin,organizationId:f.organizationId,courseId:f.courseId,
      action:'PAUSE',expectedVersion:3,
    })
    await expect(studentPeerConsent({
      actor:f.students[0],organizationId:f.organizationId,courseId:f.courseId,
      action:'WITHDRAW',
    })).resolves.toMatchObject({state:'WITHDRAWN'})
    const pupil=await db.user.findUniqueOrThrow({where:{id:f.students[0].userId}})
    expect(pupil.accountDomain).toBe('SCHOOL')
  })
})
