import {randomUUID} from 'node:crypto'
import {afterAll,beforeAll,describe,expect,it} from 'vitest'
import {PrismaClient} from '@prisma/client'
import {integrationDatabaseUrl,requireIsolatedReleaseDatabase} from './integration-env'
import {grantSyntheticHuischoolProduct} from './educationProductFixture'
import {createOrganizationUnit} from '../../modules/organization/structure'
import {personnelInput,previewPersonnel,importPersonnel,listPersonnel,issuePersonnelCredential,bindExistingPersonnel} from '../../modules/campus/personnel.service'
import {setCampusRegistrationWindow,registerCampusStudent,claimExistingCampusStudent,approveCampusClass,issueCampusActivationCodes,replaceCampusRoster} from '../../modules/campus/admission.service'
import {registerCampusStaff} from '../../modules/campus/staff.service'
import {prisma} from '../../config/database'
import {issueTeacherStudentInvitations,registerInvitedTeacherStudent,joinExistingTeacherStudent} from '../../modules/huiteacher/studentInvitation.service'
import type {AuthenticatedPrincipal} from '../../types'
const url=integrationDatabaseUrl('RELEASE_INTEGRATION_DATABASE_URL'),suite=url?describe:describe.skip
let db:PrismaClient
const login=()=> 'person_'+randomUUID().slice(0,8)
const password='Synthetic!School24'
async function fixture(){
 const admin=await db.user.create({data:{username:login(),passwordHash:'not-a-login',accountDomain:'SCHOOL',role:'TEACHER'}})
 const actor:AuthenticatedPrincipal={userId:admin.id,username:admin.username,role:'TEACHER',accountDomain:'SCHOOL',platformRole:'STANDARD',tokenVersion:0,mustChangePassword:false}
 const org=await db.organization.create({data:{id:randomUUID(),name:'synthetic personnel',productDomain:'SCHOOL',createdByUserId:admin.id}})
 const member=await db.organizationMembership.create({data:{id:randomUUID(),organizationId:org.id,userId:admin.id,orgRole:'ORG_ADMIN'}})
 await grantSyntheticHuischoolProduct(db,{organizationId:org.id,adminUserId:admin.id,adminMembershipId:member.id})
 const grade=await createOrganizationUnit({organizationId:org.id,unitKind:'GRADE',name:'一年级'})
 const cls=await createOrganizationUnit({organizationId:org.id,unitKind:'CLASS',name:'一班',parentUnitId:grade.id})
 const base={actor,organizationId:org.id}
 const input=(kind:'STUDENT'|'STAFF'|'ASSIGNMENT',rows:unknown[])=>personnelInput.parse({kind,rows})
 const student=(number='S001',extra={})=>({line:1,number,grade:'一年级',className:'一班',...extra})
 const staff=(number='T001',extra={})=>({line:1,number,name:'合成教师',...extra})
 const commit=async(i:ReturnType<typeof input>,extras={})=>{
  const p=await previewPersonnel({...base,input:i})
  return importPersonnel({...base,input:i,batchId:randomUUID(),previewToken:p.token,verifiedOffline:false,...extras})
 }
 return {...base,org:org.id,cls:cls.id,adminMember:member.id,input,student,staff,commit}
}
suite('School personnel additive import / real isolated PostgreSQL',()=>{
 beforeAll(async()=>{requireIsolatedReleaseDatabase(url!);process.env.CAMPUS_ELIGIBILITY_HMAC_KEY='ab'.repeat(32);db=new PrismaClient({datasources:{db:{url:url!}}});await db.$connect()})
 afterAll(async()=>{await db?.$disconnect();await prisma.$disconnect()})
 it('imports two students atomically; optional names and raw numbers are encrypted; no accounts/memberships are created',async()=>{
  const f=await fixture(),before=await db.user.count(),i=f.input('STUDENT',[f.student(),f.student('S002',{line:2,name:'合成学生'})])
  expect(await f.commit(i)).toMatchObject({added:2,skipped:0})
  expect(await db.user.count()).toBe(before)
  expect(await db.organizationMembership.count({where:{organizationId:f.org}})).toBe(1)
  const records=await db.$queryRaw<any[]>`SELECT profile_cipher FROM campus_personnel WHERE organization_id=${f.org}`
  expect(JSON.stringify(records)).not.toMatch(/S001|S002|合成学生/)
  expect((await listPersonnel(f)).list.map(x=>x.name).sort()).toEqual(['','合成学生'])
  const admission=await db.campusClassAdmission.findUniqueOrThrow({where:{classUnitId:f.cls}})
  expect(admission).toMatchObject({status:'DRAFT',rosterExpectedCount:2})
 })
 it('skips identical people, rejects conflicting names/classes, duplicate rows and unknown grades without partial writes',async()=>{
  const f=await fixture();await f.commit(f.input('STUDENT',[f.student()]))
  expect(await f.commit(f.input('STUDENT',[f.student()]))).toMatchObject({added:0,skipped:1})
  for(const rows of [[f.student('S002'),f.student('S001',{line:2,name:'new name'})],[f.student('S003'),f.student('S003',{line:2})],[f.student('S004',{grade:'missing'})]]){
   const i=f.input('STUDENT',rows),p=await previewPersonnel({...f,input:i});expect(p.errors).toBeGreaterThan(0)
   await expect(importPersonnel({...f,input:i,batchId:randomUUID(),previewToken:p.token,verifiedOffline:false})).rejects.toMatchObject({code:'PERSONNEL_PREVIEW_CHANGED'})
  }
  expect((await listPersonnel(f)).list).toHaveLength(1)
 })
 it('replays one batch without duplicating records and refuses reusing its ID for different content',async()=>{
  const f=await fixture(),i=f.input('STAFF',[f.staff()]),p=await previewPersonnel({...f,input:i}),request={...f,input:i,batchId:randomUUID(),previewToken:p.token,verifiedOffline:false}
  const receipt=await importPersonnel(request)
  expect(await importPersonnel(request)).toEqual(receipt)
  await expect(importPersonnel({...request,input:f.input('STAFF',[f.staff('T002')])})).rejects.toMatchObject({code:'PERSONNEL_BATCH_CONFLICT'})
 })
 it.each(['OPEN','APPROVED','CLAIMED'])('preserves %s admission locks and existing data',async state=>{
  const f=await fixture();await f.commit(f.input('STUDENT',[f.student()]))
  if(state==='CLAIMED'){
   const u=await db.user.create({data:{username:login(),passwordHash:'unused',role:'STUDENT',accountDomain:'SCHOOL'}})
   await db.campusStudentEligibility.updateMany({where:{organizationId:f.org},data:{claimedUserId:u.id}})
  }else await db.campusClassAdmission.update({where:{classUnitId:f.cls},data:{status:state}})
  const p=await previewPersonnel({...f,input:f.input('STUDENT',[f.student('S002')])})
  expect(p.rows[0]).toMatchObject({state:'error',message:expect.stringContaining('锁定')})
  expect((await db.campusClassAdmission.findUniqueOrThrow({where:{classUnitId:f.cls}})).rosterExpectedCount).toBe(1)
 })
 it('revalidates a changed class after preview and rolls back the entire confirmed batch',async()=>{
  const f=await fixture(),i=f.input('STUDENT',[f.student()]),p=await previewPersonnel({...f,input:i})
  await db.campusClassAdmission.create({data:{organizationId:f.org,classUnitId:f.cls,status:'APPROVED'}})
  await expect(importPersonnel({...f,input:i,batchId:randomUUID(),previewToken:p.token,verifiedOffline:false})).rejects.toMatchObject({code:'PERSONNEL_PREVIEW_CHANGED'})
  expect((await listPersonnel(f)).list).toHaveLength(0)
  expect(await db.campusStudentEligibility.count({where:{organizationId:f.org}})).toBe(0)
 })
 it('binds student codes to exactly one student; rejects generic/mismatched/reissued codes; still requires independent whole-class approval',async()=>{
  const f=await fixture();await f.commit(f.input('STUDENT',[f.student(),f.student('S002',{line:2})]))
  const list=(await listPersonnel(f)).list,p1=list.find(x=>x.number==='S001')!,p2=list.find(x=>x.number==='S002')!
  const c1=await issuePersonnelCredential({...f,personId:p1.id}),old=await issuePersonnelCredential({...f,personId:p2.id}),c2=await issuePersonnelCredential({...f,personId:p2.id})
  await setCampusRegistrationWindow({...f,classUnitId:f.cls,action:'OPEN',closesAt:new Date(Date.now()+3600000)})
  const generic=await issueCampusActivationCodes({...f,classUnitId:f.cls,count:1,ttlMinutes:30})
  const register=(n:string,code:string)=>registerCampusStudent({organizationId:f.org,classUnitId:f.cls,studentNumber:n,activationCode:code,username:login(),password})
  for(const [n,c] of [['S002',c1.code],['S002',old.code],['S001',generic.codes[0]]])await expect(register(n,c)).rejects.toMatchObject({code:'CAMPUS_REGISTRATION_UNAVAILABLE'})
  const first=await register('S001',c1.code)
  expect(first.status).toBe('PENDING_CLASS_APPROVAL')
  expect(await db.organizationMembership.count({where:{organizationId:f.org,userId:first.userId}})).toBe(0)
  await register('S002',c2.code)
  const psych=await db.user.create({data:{username:login(),passwordHash:'unused',role:'TEACHER',accountDomain:'SCHOOL'}})
  const m=await db.organizationMembership.create({data:{id:randomUUID(),organizationId:f.org,userId:psych.id,orgRole:'MEMBER'}})
  await db.organizationPersonaGrant.create({data:{id:randomUUID(),organizationId:f.org,membershipId:m.id,persona:'COUNSELOR',grantedByUserId:f.actor.userId}})
  await db.organizationCapabilityGrant.create({data:{id:randomUUID(),organizationId:f.org,membershipId:m.id,capability:'PSYCHOLOGY_STAFF',grantedByUserId:f.actor.userId}})
  await setCampusRegistrationWindow({...f,classUnitId:f.cls,action:'CLOSE'})
  const admission=await db.campusClassAdmission.findUniqueOrThrow({where:{classUnitId:f.cls}})
  await expect(approveCampusClass({...f,classUnitId:f.cls,expectedRosterVersion:admission.rosterVersion})).rejects.toMatchObject({code:'PSYCHOLOGY_STAFF_REQUIRED'})
  await approveCampusClass({...f,actor:{...f.actor,userId:psych.id},classUnitId:f.cls,expectedRosterVersion:admission.rosterVersion})
  expect((await db.campusStudentEnrollment.findUniqueOrThrow({where:{userId:first.userId}})).status).toBe('APPROVED')
 })
 it('preserves manual registration but prevents the legacy replacement endpoint from erasing imported people',async()=>{
  const f=await fixture();await f.commit(f.input('STUDENT',[f.student()]))
  await expect(replaceCampusRoster({...f,classUnitId:f.cls,studentNumbers:['S002']})).rejects.toMatchObject({code:'PERSONNEL_ADDITIVE_IMPORT_REQUIRED'})
  expect((await listPersonnel(f)).list[0].number).toBe('S001')
 })
 it('activates teacher + pending multi-class assignments without admin/counseling capability or report relationships',async()=>{
  const f=await fixture();await f.commit(f.input('STAFF',[f.staff()]))
  await f.commit(f.input('ASSIGNMENT',[{line:1,number:'T001',grade:'一年级',className:'一班',staffRole:'HOMEROOM'}]))
  const person=(await listPersonnel(f)).list[0],code=await issuePersonnelCredential({...f,personId:person.id}),name=login()
  await registerCampusStaff({inviteCode:code.code,username:name,password})
  const account=await db.campusAccount.findUniqueOrThrow({where:{normalizedLogin:name}})
  const member=await db.organizationMembership.findFirstOrThrow({where:{organizationId:f.org,userId:account.userId}})
  expect(member.orgRole).toBe('MEMBER')
  expect(await db.organizationCapabilityGrant.count({where:{organizationId:f.org,membershipId:member.id}})).toBe(0)
  expect(await db.educationProductRoleGrant.count({where:{organizationId:f.org,membershipId:member.id}})).toBe(0)
  const assignments=await db.$queryRaw<any[]>`SELECT * FROM organization_staff_class_assignments WHERE membership_id=${member.id}`
  expect(assignments).toHaveLength(1)
  await expect(registerCampusStaff({inviteCode:code.code,username:login(),password})).rejects.toBeDefined()
 })
 it('does not grant psychology capability to an imported counselor',async()=>{
  const f=await fixture();await f.commit(f.input('STAFF',[f.staff('T001',{persona:'COUNSELOR'})]))
  const person=(await listPersonnel(f)).list[0],code=await issuePersonnelCredential({...f,personId:person.id}),name=login()
  await registerCampusStaff({inviteCode:code.code,username:name,password})
  const a=await db.campusAccount.findUniqueOrThrow({where:{normalizedLogin:name}}),m=await db.organizationMembership.findFirstOrThrow({where:{organizationId:f.org,userId:a.userId}})
  expect(await db.organizationPersonaGrant.count({where:{membershipId:m.id,persona:'COUNSELOR'}})).toBe(1)
  expect(await db.organizationCapabilityGrant.count({where:{membershipId:m.id}})).toBe(0)
 })
 it('requires offline verification and authenticated ownership for existing staff; never resets passwords',async()=>{
  const f=await fixture(),name=login(),u=await db.user.create({data:{username:login(),passwordHash:'original hash retained',role:'TEACHER',accountDomain:'SCHOOL'}})
  await db.campusAccount.create({data:{userId:u.id,normalizedLogin:name,loginName:name}})
  const i=f.input('STAFF',[f.staff('T001',{username:name})])
  await expect(f.commit(i)).rejects.toMatchObject({code:'PERSONNEL_OFFLINE_VERIFICATION_REQUIRED'})
  await f.commit(i,{verifiedOffline:true})
  const person=(await listPersonnel(f)).list[0],c=await issuePersonnelCredential({...f,personId:person.id})
  await expect(registerCampusStaff({inviteCode:c.code,username:login(),password})).rejects.toBeDefined()
  await expect(registerCampusStaff({inviteCode:c.code,username:'',password:'',actorUserId:f.actor.userId})).rejects.toBeDefined()
  await registerCampusStaff({inviteCode:c.code,username:'',password:'',actorUserId:u.id})
  expect((await db.user.findUniqueOrThrow({where:{id:u.id}})).passwordHash).toBe('original hash retained')
 })
 it('reuses the existing student identity only through the authenticated claim path',async()=>{
  const f=await fixture(),name=login(),u=await db.user.create({data:{username:login(),passwordHash:'unchanged',role:'STUDENT',accountDomain:'SCHOOL'}})
  await db.campusAccount.create({data:{userId:u.id,normalizedLogin:name,loginName:name}})
  await f.commit(f.input('STUDENT',[f.student('S001',{username:name})]),{verifiedOffline:true})
  const person=(await listPersonnel(f)).list[0],c=await issuePersonnelCredential({...f,personId:person.id})
  await setCampusRegistrationWindow({...f,classUnitId:f.cls,action:'OPEN',closesAt:new Date(Date.now()+3600000)})
  await expect(registerCampusStudent({organizationId:f.org,classUnitId:f.cls,studentNumber:'S001',activationCode:c.code,username:login(),password})).rejects.toBeDefined()
  const result=await claimExistingCampusStudent({...f,actor:{...f.actor,userId:u.id,role:'STUDENT'},classUnitId:f.cls,studentNumber:'S001',activationCode:c.code})
  expect(result).toMatchObject({userId:u.id,status:'PENDING_CLASS_APPROVAL',reusedEducationIdentity:true})
  expect((await db.user.findUniqueOrThrow({where:{id:u.id}})).passwordHash).toBe('unchanged')
 })
 it('refuses ordinary teachers, psychology-only users, cross-school actors and revoked issuers',async()=>{
  const f=await fixture(),other=await fixture(),i=f.input('STAFF',[f.staff()])
  await expect(previewPersonnel({...f,actor:other.actor,input:i})).rejects.toMatchObject({statusCode:403})
  await f.commit(i);const p=(await listPersonnel(f)).list[0],c=await issuePersonnelCredential({...f,personId:p.id})
  const denial=await db.organizationAccessDeny.create({data:{id:randomUUID(),organizationId:f.org,userId:f.actor.userId,permission:'ORGANIZATION_GOVERNANCE',reason:'synthetic revocation',deniedByUserId:f.actor.userId}})
  await expect(previewPersonnel({...f,input:i})).rejects.toMatchObject({statusCode:403})
  await db.organizationAccessDeny.update({where:{id:denial.id},data:{liftedAt:new Date(),liftedByUserId:f.actor.userId}})
  await expect(registerCampusStaff({inviteCode:c.code,username:login(),password})).rejects.toBeDefined()
  await db.organizationMembership.update({where:{id:f.adminMember},data:{orgRole:'MEMBER'}})
  for(const persona of ['TEACHER','COUNSELOR'] as const){
   await db.organizationPersonaGrant.create({data:{id:randomUUID(),organizationId:f.org,membershipId:f.adminMember,persona,grantedByUserId:f.actor.userId}})
   await expect(previewPersonnel({...f,input:i})).rejects.toMatchObject({statusCode:403})
  }
 })

 it('rolls back rows already inserted when a later database write fails',async()=>{
  const f=await fixture(),input=f.input('STUDENT',[f.student(),f.student('S002',{line:2})]),p=await previewPersonnel({...f,input})
  // A synthetic fault after the first personnel row, scoped to this test org.
  const fn='personnel_fault_'+randomUUID().replace(/-/g,''),trigger=fn+'_trigger'
  await db.$executeRawUnsafe(`CREATE FUNCTION ${fn}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.organization_id='${f.org}' AND (SELECT count(*) FROM campus_personnel WHERE organization_id=NEW.organization_id)>0 THEN RAISE EXCEPTION 'synthetic mid-batch fault'; END IF; RETURN NEW; END $$`)
  await db.$executeRawUnsafe(`CREATE TRIGGER ${trigger} BEFORE INSERT ON campus_personnel FOR EACH ROW EXECUTE FUNCTION ${fn}()`)
  try{
   await expect(importPersonnel({...f,input,batchId:randomUUID(),previewToken:p.token,verifiedOffline:false})).rejects.toBeDefined()
   expect((await listPersonnel(f)).list).toHaveLength(0)
   expect(await db.campusStudentEligibility.count({where:{organizationId:f.org}})).toBe(0)
   expect(await db.campusClassAdmission.count({where:{organizationId:f.org}})).toBe(0)
   expect(await db.$queryRaw<any[]>`SELECT id FROM campus_personnel_import_batches WHERE organization_id=${f.org}`).toEqual([])
  }finally{await db.$executeRawUnsafe(`DROP TRIGGER ${trigger} ON campus_personnel`);await db.$executeRawUnsafe(`DROP FUNCTION ${fn}()`)}
 })
 async function teacherProduct(f:Awaited<ReturnType<typeof fixture>>){
  await db.educationProductEntitlement.create({data:{organizationId:f.org,product:'HUITEACHER',status:'ACTIVE',grantedByUserId:f.actor.userId}})
  await db.educationProductRoleGrant.create({data:{id:randomUUID(),organizationId:f.org,membershipId:f.adminMember,product:'HUITEACHER',role:'PRODUCT_ADMIN',grantedByUserId:f.actor.userId}})
 }
 it('links a Teacher-first activated student only after offline verification and owner confirmation, retaining School approval',async()=>{
  const f=await fixture();await teacherProduct(f);await f.commit(f.input('STUDENT',[f.student()]))
  const invite=await issueTeacherStudentInvitations({organizationId:f.org,classUnitId:f.cls,actorUserId:f.actor.userId,studentNumbers:['S001']}),name=login()
  const teacher=await registerInvitedTeacherStudent({inviteCode:invite.list[0].inviteCode,studentNumber:'S001',username:name,password})
  const person=(await listPersonnel(f)).list[0],old=await issuePersonnelCredential({...f,personId:person.id})
  await setCampusRegistrationWindow({...f,classUnitId:f.cls,action:'OPEN',closesAt:new Date(Date.now()+3600000)})
  await expect(registerCampusStudent({organizationId:f.org,classUnitId:f.cls,studentNumber:'S001',activationCode:old.code,username:login(),password})).rejects.toMatchObject({code:'CAMPUS_REGISTRATION_UNAVAILABLE'})
  await bindExistingPersonnel({...f,personId:person.id,username:name,verifiedOffline:true})
  await expect(bindExistingPersonnel({...f,personId:person.id,username:name,verifiedOffline:true})).rejects.toMatchObject({code:'PERSONNEL_ALREADY_BOUND'})
  const code=await issuePersonnelCredential({...f,personId:person.id})
  await claimExistingCampusStudent({...f,actor:{...f.actor,userId:teacher.userId!,role:'STUDENT'},classUnitId:f.cls,studentNumber:'S001',activationCode:code.code})
  expect((await db.campusStudentEnrollment.findUniqueOrThrow({where:{userId:teacher.userId!}})).status).toBe('PENDING_CLASS_APPROVAL')
 })
 it('prevents School-first students from creating a second Teacher identity and retains authenticated Teacher join',async()=>{
  const f=await fixture();await teacherProduct(f);await f.commit(f.input('STUDENT',[f.student()]))
  const person=(await listPersonnel(f)).list[0],code=await issuePersonnelCredential({...f,personId:person.id})
  await setCampusRegistrationWindow({...f,classUnitId:f.cls,action:'OPEN',closesAt:new Date(Date.now()+3600000)})
  const school=await registerCampusStudent({organizationId:f.org,classUnitId:f.cls,studentNumber:'S001',activationCode:code.code,username:login(),password})
  const invite=await issueTeacherStudentInvitations({organizationId:f.org,classUnitId:f.cls,actorUserId:f.actor.userId,studentNumbers:['S001']})
  await expect(registerInvitedTeacherStudent({inviteCode:invite.list[0].inviteCode,studentNumber:'S001',username:login(),password})).rejects.toMatchObject({code:'HUITEACHER_EXISTING_STUDENT_ACCOUNT_REQUIRED'})
  const joined=await joinExistingTeacherStudent({actorUserId:school.userId,inviteCode:invite.list[0].inviteCode,studentNumber:'S001'})
  expect(joined.userId).toBe(school.userId)
  expect((await db.campusStudentEnrollment.findUniqueOrThrow({where:{userId:school.userId}})).status).toBe('PENDING_CLASS_APPROVAL')
 })
 it('serializes concurrent School/Teacher activation of an imported number into one education account',async()=>{
  const f=await fixture();await teacherProduct(f);await f.commit(f.input('STUDENT',[f.student()]))
  const person=(await listPersonnel(f)).list[0],code=await issuePersonnelCredential({...f,personId:person.id})
  await setCampusRegistrationWindow({...f,classUnitId:f.cls,action:'OPEN',closesAt:new Date(Date.now()+3600000)})
  const invite=await issueTeacherStudentInvitations({organizationId:f.org,classUnitId:f.cls,actorUserId:f.actor.userId,studentNumbers:['S001']}),before=await db.campusAccount.count()
  const results=await Promise.allSettled([
   registerCampusStudent({organizationId:f.org,classUnitId:f.cls,studentNumber:'S001',activationCode:code.code,username:login(),password}),
   registerInvitedTeacherStudent({inviteCode:invite.list[0].inviteCode,studentNumber:'S001',username:login(),password})
  ])
  expect(results.filter(x=>x.status==='fulfilled')).toHaveLength(1)
  expect(await db.campusAccount.count()).toBe(before+1)
 })
 it('concurrent duplicate batches cannot create duplicate people',async()=>{
  const f=await fixture(),input=f.input('STAFF',[f.staff()]),p=await previewPersonnel({...f,input}),batchId=randomUUID(),request={...f,input,batchId,previewToken:p.token,verifiedOffline:false}
  const results=await Promise.allSettled([importPersonnel(request),importPersonnel(request)])
  expect(results.some(x=>x.status==='fulfilled')).toBe(true)
  expect((await listPersonnel(f)).list).toHaveLength(1)
  expect(await importPersonnel(request)).toMatchObject({added:1})
 })
})
