import {randomUUID} from 'node:crypto'
import {PrismaClient} from '@prisma/client'
import {beforeAll,afterAll,describe,it,expect} from 'vitest'
import {integrationDatabaseUrl,requireIsolatedReleaseDatabase} from './integration-env'
import {grantSyntheticHuischoolProduct} from './educationProductFixture'
import {createOrganizationUnit} from '../../modules/organization/structure'
import {personnelInput,previewPersonnel,importPersonnel} from '../../modules/campus/personnel.service'
import {directoryQuery,listPersonnelDirectory,readPersonnelDirectoryEntry} from '../../modules/campus/personnel.directory'
import {digestCampusStudentNumber} from '../../modules/campus/admission.service'
import {prisma} from '../../config/database'
import type {AuthenticatedPrincipal} from '../../types'
const url=integrationDatabaseUrl('RELEASE_INTEGRATION_DATABASE_URL'),suite=url?describe:describe.skip
let db:PrismaClient
const login=()=> 'directory_'+randomUUID().slice(0,8)
async function fixture(){
 const admin=await db.user.create({data:{username:login(),passwordHash:'synthetic-unused',accountDomain:'SCHOOL',role:'TEACHER'}})
 const actor:AuthenticatedPrincipal={userId:admin.id,username:admin.username,role:'TEACHER',accountDomain:'SCHOOL',platformRole:'STANDARD',tokenVersion:0,mustChangePassword:false}
 const org=await db.organization.create({data:{id:randomUUID(),name:'synthetic directory',productDomain:'SCHOOL',createdByUserId:admin.id}})
 const m=await db.organizationMembership.create({data:{id:randomUUID(),organizationId:org.id,userId:admin.id,orgRole:'ORG_ADMIN'}})
 await grantSyntheticHuischoolProduct(db,{organizationId:org.id,adminUserId:admin.id,adminMembershipId:m.id})
 const grade=await createOrganizationUnit({organizationId:org.id,unitKind:'GRADE',name:'一年级'})
 const cls=await createOrganizationUnit({organizationId:org.id,unitKind:'CLASS',parentUnitId:grade.id,name:'一班'})
 const base={actor,organizationId:org.id}
 const list=(q={})=>listPersonnelDirectory({...base,query:directoryQuery.parse(q)})
 const add=async(kind:'STUDENT'|'STAFF',number:string,extra={})=>{
  const input=personnelInput.parse({kind,rows:[{line:2,number,...(kind==='STAFF'?{name:'合成教师'}:{grade:'一年级',className:'一班'}),...extra}]})
  const p=await previewPersonnel({...base,input});await importPersonnel({...base,input,batchId:randomUUID(),previewToken:p.token,verifiedOffline:!!(extra as any).username})
 }
 const legacy=async(kind:'STUDENT'|'TEACHER',membership=true)=>{
  const name=login(),u=await db.user.create({data:{username:name,passwordHash:'synthetic-unused',accountDomain:'SCHOOL',role:kind,teacherApproved:true}})
  await db.campusAccount.create({data:{userId:u.id,loginName:name,normalizedLogin:name}})
  if(membership){
   const m=await db.organizationMembership.create({data:{id:randomUUID(),organizationId:org.id,userId:u.id}})
   await db.organizationPersonaGrant.create({data:{id:randomUUID(),organizationId:org.id,membershipId:m.id,persona:kind,grantedByUserId:admin.id}})
  }
  return u
 }
 return {...base,admin,member:m.id,cls:cls.id,list,add,legacy}
}
suite('School unified directory / isolated real PostgreSQL',()=>{
 beforeAll(async()=>{requireIsolatedReleaseDatabase(url!);process.env.CAMPUS_ELIGIBILITY_HMAC_KEY='ab'.repeat(32);db=new PrismaClient({datasources:{db:{url:url!}}});await db.$connect()})
 afterAll(async()=>{await db?.$disconnect();await prisma.$disconnect()})
 it('includes imported and existing personnel, filters beyond the first page and never returns cipher/account identifiers',async()=>{
  const f=await fixture();await f.add('STUDENT','000001');const old=await f.legacy('TEACHER')
  const all=await f.list({pageSize:1});expect(all.total).toBe(2);expect(all.list).toHaveLength(1)
  const next=await f.list({pageSize:1,page:2});expect(next.list[0].id).not.toBe(all.list[0].id)
  expect((await f.list({query:'000001'})).list[0]).toMatchObject({number:'000001',activation:'PENDING',membership:'NONE',admission:'NOT_REGISTERED'})
  expect((await f.list({query:old.username})).list[0]).toMatchObject({source:'EXISTING',name:null,activation:'ACTIVATED',membership:'CURRENT'})
  expect((await f.list({kind:'STAFF'})).total).toBe(1)
  expect((await f.list({activation:'PENDING',classUnitId:f.cls})).total).toBe(1)
  const projection=JSON.stringify(await f.list());expect(projection).not.toMatch(/profileCipher|number_digest|claimed_user_id|expected_user_id|password/)
 })
 it('keeps expected-account records separate; merges only an owner-confirmed binding',async()=>{
  const f=await fixture(),old=await f.legacy('TEACHER')
  await f.add('STAFF','T0001',{username:old.username});expect((await f.list()).total).toBe(2)
  const pending=(await f.list({activation:'PENDING'})).list[0];expect(pending.activation).toBe('OWNER_CONFIRMATION');expect(pending.username).toBeNull()
  await db.$executeRaw`UPDATE campus_personnel SET claimed_user_id=${old.id} WHERE id=${pending.personId}`
  const merged=await f.list();expect(merged.total).toBe(1);expect(merged.list[0]).toMatchObject({source:'IMPORTED',activation:'ACTIVATED',membership:'CURRENT'})
 })
 it('includes registered students awaiting independent class approval without inventing names or memberships',async()=>{
  const f=await fixture(),old=await f.legacy('STUDENT',false)
  await db.campusClassAdmission.create({data:{organizationId:f.organizationId,classUnitId:f.cls,rosterVersion:1}})
  const eligible=await db.campusStudentEligibility.create({data:{id:randomUUID(),organizationId:f.organizationId,classUnitId:f.cls,studentNoDigest:digestCampusStudentNumber(f.organizationId,'OLD001'),rosterVersion:1,claimedUserId:old.id}})
  await db.campusStudentEnrollment.create({data:{userId:old.id,organizationId:f.organizationId,classUnitId:f.cls,eligibilityId:eligible.id,rosterVersion:1}})
  const list=await f.list({kind:'STUDENT'});expect(list.total).toBe(1);expect(list.list[0]).toMatchObject({activation:'ACTIVATED',membership:'NONE',admission:'PENDING_CLASS_APPROVAL',name:null,number:null})
  expect(list.list[0].reference).toBeTruthy();expect((await f.list({query:'old001'})).total).toBe(1)
  expect(await db.organizationMembership.count({where:{organizationId:f.organizationId}})).toBe(1)
 })
 it('retains ended members and reports unusable accounts independently of membership',async()=>{
  const f=await fixture(),old=await f.legacy('TEACHER')
  await db.organizationMembership.updateMany({where:{organizationId:f.organizationId,userId:old.id},data:{validFrom:new Date(Date.now()-20000),validUntil:new Date(Date.now()-10000)}})
  await db.user.update({where:{id:old.id},data:{isFrozen:true}})
  const list=await f.list({membership:'ENDED'});expect(list.total).toBe(1);expect(list.list[0]).toMatchObject({account:'UNAVAILABLE',membership:'ENDED',activation:'ACTIVATED'})
 })
 it('denies cross-school detail, non-School identities, revoked authority and explicit governance deny',async()=>{
  const f=await fixture(),other=await fixture();await f.add('STAFF','T001')
  const entry=(await f.list()).list[0]
  await expect(readPersonnelDirectoryEntry({...other,entryId:entry.id})).rejects.toMatchObject({statusCode:404})
  await expect(listPersonnelDirectory({...f,actor:{...f.actor,accountDomain:'TRAINING'},query:directoryQuery.parse({})})).rejects.toMatchObject({statusCode:403})
  await db.organizationAccessDeny.create({data:{id:randomUUID(),organizationId:f.organizationId,userId:f.actor.userId,permission:'ORGANIZATION_GOVERNANCE',reason:'synthetic deny',deniedByUserId:f.actor.userId}})
  await expect(f.list()).rejects.toMatchObject({statusCode:403})
  await db.organizationAccessDeny.deleteMany({where:{organizationId:f.organizationId}})
  await db.educationProductRoleGrant.updateMany({where:{organizationId:f.organizationId},data:{revokedAt:new Date(),revokedByUserId:f.actor.userId}})
  await expect(readPersonnelDirectoryEntry({...f,entryId:entry.id})).rejects.toMatchObject({statusCode:403})
 })
 it('shows pending imported teaching assignments without granting authority',async()=>{
  const f=await fixture();await f.add('STAFF','T001')
  const p=(await f.list()).list[0]
  await db.$executeRaw`INSERT INTO campus_personnel_assignments(organization_id,person_id,class_unit_id,staff_role) VALUES(${f.organizationId},${p.personId},${f.cls},'TEACHING')`
  expect((await f.list({classUnitId:f.cls})).total).toBe(1)
  const detail=await readPersonnelDirectoryEntry({...f,entryId:p.id});expect(detail.classes).toEqual([{className:'一班',grade:'一年级',role:'TEACHING',pending:true}])
  expect(detail.membership).toBe('NONE')
 })
 it('phase4 uses current School governance and never infers Teacher administration from it',async()=>{
  const f=await fixture();await db.campusAccount.create({data:{userId:f.admin.id,loginName:f.admin.username,normalizedLogin:f.admin.username}})
  await db.user.update({where:{id:f.admin.id},data:{teacherApproved:true}})
  const before=await db.educationProductRoleGrant.count({where:{organizationId:f.organizationId}})
  const detail=await readPersonnelDirectoryEntry({...f,entryId:'u.'+f.admin.id})
  expect(detail.access.state).toBe('READY')
  expect(detail.access.functions).toContainEqual({key:'SCHOOL_GOVERNANCE',available:true})
  expect(detail.access.functions).toContainEqual({key:'TEACHER_ADMIN',available:false})
  expect(detail.access.products).toContainEqual({product:'HUITEACHER',member:false})
  expect(await db.educationProductRoleGrant.count({where:{organizationId:f.organizationId}})).toBe(before)
  expect(JSON.stringify(detail.access)).not.toMatch(/password|tokenVersion|username|source_artifact|report_body|reason|userId|membershipId/)
 })
 it('phase4 keeps an expected existing account unlinked until owner confirmation',async()=>{
  const f=await fixture(),old=await f.legacy('TEACHER')
  await f.add('STAFF','PENDING01',{username:old.username})
  const p=(await f.list({activation:'PENDING'})).list[0]
  const detail=await readPersonnelDirectoryEntry({...f,entryId:p.id})
  expect(detail.access).toMatchObject({state:'PENDING_ACTIVATION',functions:[],products:[],grants:[]})
  expect(await db.organizationMembership.count({where:{organizationId:f.organizationId,userId:old.id}})).toBe(1)
 })
 it('phase4 separates real authoring decisions from unrevoked grants and explicit deny',async()=>{
  const f=await fixture(),target=await f.legacy('TEACHER')
  const member=await db.organizationMembership.findFirstOrThrow({where:{organizationId:f.organizationId,userId:target.id}})
  await db.organizationPersonaGrant.create({data:{id:randomUUID(),organizationId:f.organizationId,membershipId:member.id,persona:'COUNSELOR',grantedByUserId:f.admin.id}})
  const cap=await db.organizationCapabilityGrant.create({data:{id:randomUUID(),organizationId:f.organizationId,membershipId:member.id,capability:'PSYCHOLOGY_STAFF',grantedByUserId:f.admin.id}})
  const read=()=>readPersonnelDirectoryEntry({...f,entryId:'u.'+target.id})
  expect((await read()).access.functions).toContainEqual({key:'SCHOOL_AUTHOR',available:true})
  await db.organizationAccessDeny.create({data:{id:randomUUID(),organizationId:f.organizationId,userId:target.id,permission:'PSYCHOLOGY_STAFF',reason:'private text must not be disclosed',deniedByUserId:f.admin.id}})
  const denied=(await read()).access
  expect(denied.functions).toContainEqual({key:'SCHOOL_AUTHOR',available:false})
  expect(denied.grants).toContainEqual(expect.objectContaining({code:'PSYCHOLOGY_STAFF',revokedAt:null}))
  expect(denied.denies).toContainEqual(expect.objectContaining({permission:'PSYCHOLOGY_STAFF',liftedAt:null}))
  expect(JSON.stringify(denied)).not.toContain('private text')
  await db.organizationCapabilityGrant.update({where:{id:cap.id},data:{revokedAt:new Date(),revokedByUserId:f.admin.id}})
  expect((await read()).access.grants.find(x=>x.code==='PSYCHOLOGY_STAFF')?.revokedAt).toBeTruthy()
 })
 it.each(['ended','future','frozen','expired','password-change'] as const)('phase4 fails closed for %s target while retaining provenance',async state=>{
  const f=await fixture(),target=await f.legacy('TEACHER')
  const member=await db.organizationMembership.findFirstOrThrow({where:{organizationId:f.organizationId,userId:target.id}})
  await db.educationProductRoleGrant.create({data:{id:randomUUID(),organizationId:f.organizationId,membershipId:member.id,product:'HUISCHOOL',role:'PRODUCT_ADMIN',grantedByUserId:f.admin.id}})
  await db.organizationMembership.update({where:{id:member.id},data:{orgRole:'ORG_ADMIN',...(state==='ended'?{validFrom:new Date(Date.now()-10000),validUntil:new Date(Date.now()-1000)}:state==='future'?{validFrom:new Date(Date.now()+100000)}:{})}})
  if(state==='frozen')await db.user.update({where:{id:target.id},data:{isFrozen:true}})
  if(state==='expired')await db.user.update({where:{id:target.id},data:{expiresAt:new Date(Date.now()-1000)}})
  if(state==='password-change')await db.user.update({where:{id:target.id},data:{mustChangePassword:true}})
  const detail=await readPersonnelDirectoryEntry({...f,entryId:'u.'+target.id})
  expect(detail.access.functions.every(x=>!x.available)).toBe(true)
  expect(detail.access.products.every(x=>!x.member)).toBe(true)
  expect(detail.access.grants.some(x=>x.kind==='PRODUCT_ADMIN'&&!x.revokedAt)).toBe(true)
 })
 it('phase4 reads expired class assignments as history and never includes another school',async()=>{
  const f=await fixture(),target=await f.legacy('TEACHER'),other=await fixture()
  const member=await db.organizationMembership.findFirstOrThrow({where:{organizationId:f.organizationId,userId:target.id}})
  await db.$executeRaw`INSERT INTO organization_staff_class_assignments(id,organization_id,membership_id,class_unit_id,staff_role,valid_from,valid_until) VALUES(${randomUUID()},${f.organizationId},${member.id},${f.cls},'TEACHING',statement_timestamp()-interval '2 days',statement_timestamp()-interval '1 day')`
  const detail=await readPersonnelDirectoryEntry({...f,entryId:'u.'+target.id})
  expect(detail.access.assignments).toContainEqual(expect.objectContaining({className:'一班',current:false,role:'TEACHING'}))
  await expect(readPersonnelDirectoryEntry({...other,entryId:'u.'+target.id})).rejects.toMatchObject({statusCode:404})
 })
 it.each(['STUDENT','TEACHER','COUNSELOR','PARENT'] as const)('phase4 keeps directory and permission metadata closed to non-governor %s',async role=>{
  const f=await fixture();await f.add('STAFF','PRIVATE01');const p=(await f.list()).list[0]
  const target=role==='PARENT'?await db.user.create({data:{username:login(),passwordHash:'synthetic-unused',accountDomain:'SCHOOL',role:'PARENT'}}):await f.legacy(role==='STUDENT'?'STUDENT':'TEACHER')
  if(role==='COUNSELOR'){
   const m=await db.organizationMembership.findFirstOrThrow({where:{organizationId:f.organizationId,userId:target.id}})
   await db.organizationPersonaGrant.create({data:{id:randomUUID(),organizationId:f.organizationId,membershipId:m.id,persona:'COUNSELOR',grantedByUserId:f.admin.id}})
   await db.organizationCapabilityGrant.create({data:{id:randomUUID(),organizationId:f.organizationId,membershipId:m.id,capability:'PSYCHOLOGY_STAFF',grantedByUserId:f.admin.id}})
  }
  await expect(readPersonnelDirectoryEntry({...f,entryId:p.id,actor:{...f.actor,userId:target.id,role:target.role,username:target.username}})).rejects.toMatchObject({statusCode:403})
 })

 it('phase4 reflects independent Teacher grant, product deny and revocation immediately on a fresh read',async()=>{
  const f=await fixture(),target=await f.legacy('TEACHER')
  const member=await db.organizationMembership.findFirstOrThrow({where:{organizationId:f.organizationId,userId:target.id}})
  await db.educationProductEntitlement.create({data:{organizationId:f.organizationId,product:'HUITEACHER',grantedByUserId:f.admin.id}})
  const grant=await db.educationProductRoleGrant.create({data:{id:randomUUID(),organizationId:f.organizationId,membershipId:member.id,product:'HUITEACHER',role:'PRODUCT_ADMIN',grantedByUserId:f.admin.id}})
  const read=async()=>(await readPersonnelDirectoryEntry({...f,entryId:'u.'+target.id})).access
  expect((await read()).functions).toContainEqual({key:'TEACHER_ADMIN',available:true})
  expect((await read()).functions).toContainEqual({key:'SCHOOL_GOVERNANCE',available:false})
  const deny=await db.organizationAccessDeny.create({data:{id:randomUUID(),organizationId:f.organizationId,userId:target.id,permission:'HUITEACHER_ACCESS',reason:'synthetic deny',deniedByUserId:f.admin.id}})
  const denied=await read();expect(denied.products).toContainEqual({product:'HUISCHOOL',member:true});expect(denied.products).toContainEqual({product:'HUITEACHER',member:false})
  await db.organizationAccessDeny.update({where:{id:deny.id},data:{liftedAt:new Date(),liftedByUserId:f.admin.id}})
  await db.educationProductRoleGrant.update({where:{id:grant.id},data:{revokedAt:new Date(),revokedByUserId:f.admin.id}})
  const revoked=await read();expect(revoked.functions).toContainEqual({key:'TEACHER_ADMIN',available:false});expect(revoked.products).toContainEqual({product:'HUITEACHER',member:true})
  expect(revoked.grants.find(g=>g.product==='HUITEACHER')?.revokedAt).toBeTruthy()
 })

 it('phase4 computes current rights independently of the bounded provenance history',async()=>{
  const f=await fixture(),target=await f.legacy('TEACHER')
  const member=await db.organizationMembership.findFirstOrThrow({where:{organizationId:f.organizationId,userId:target.id}})
  const old=new Date(Date.now()-100000)
  await db.organizationPersonaGrant.create({data:{id:randomUUID(),organizationId:f.organizationId,membershipId:member.id,persona:'COUNSELOR',grantedAt:old,grantedByUserId:f.admin.id}})
  await db.organizationCapabilityGrant.create({data:{id:randomUUID(),organizationId:f.organizationId,membershipId:member.id,capability:'PSYCHOLOGY_STAFF',grantedAt:old,grantedByUserId:f.admin.id}})
  await db.organizationCapabilityGrant.createMany({data:Array.from({length:32},()=>({id:randomUUID(),organizationId:f.organizationId,membershipId:member.id,capability:'REPORT_EXPORT',grantedAt:new Date(Date.now()-50000),grantedByUserId:f.admin.id,revokedAt:new Date(Date.now()-1000),revokedByUserId:f.admin.id}))})
  const detail=await readPersonnelDirectoryEntry({...f,entryId:'u.'+target.id})
  expect(detail.access.truncated).toBe(true)
  expect(detail.access.grants.some(g=>g.code==='PSYCHOLOGY_STAFF')).toBe(false)
  expect(detail.access.functions).toContainEqual({key:'SCHOOL_AUTHOR',available:true})
 })

})
