import {randomUUID} from 'node:crypto'
import {PrismaClient,type UserRole} from '@prisma/client'
import {beforeAll,afterAll,describe,it,expect} from 'vitest'
import {integrationDatabaseUrl,requireIsolatedReleaseDatabase} from './integration-env'
import {grantSyntheticHuischoolProduct} from './educationProductFixture'
import {createCampusActivity,changeCampusActivityStatus} from '../../modules/campus/activity.service'
import {addCampusActivityTask,listCampusActivityContent,changeCampusActivityContent} from '../../modules/campus/activity.tasks'
import {listSchoolMfaResets,requestSchoolMfaReset,approveSchoolMfaReset} from '../../modules/campus/recovery.service'
import type {AuthenticatedPrincipal} from '../../types'
const url=integrationDatabaseUrl('SCHOOL_AUDIT_FIX_DATABASE_URL'),suite=url?describe:describe.skip
let db:PrismaClient,organizationId:string,admin:AuthenticatedPrincipal,second:AuthenticatedPrincipal,target:AuthenticatedPrincipal
const actor=(u:{id:string;username:string;role:UserRole}):AuthenticatedPrincipal=>({userId:u.id,username:u.username,role:u.role,
 platformRole:'STANDARD',accountDomain:'SCHOOL',tokenVersion:0,mustChangePassword:false})
suite('School audit fixes: transactional content and independent MFA recovery',()=>{
 beforeAll(async()=>{
  requireIsolatedReleaseDatabase(url!)
  db=new PrismaClient({datasources:{db:{url:url!}}});await db.$connect()
  const make=async(role:UserRole)=>{
   const u=await db.user.create({data:{username:'audit_fix_'+randomUUID().slice(0,15),passwordHash:'synthetic-only',accountDomain:'SCHOOL',role,teacherApproved:true}})
   await db.campusAccount.create({data:{userId:u.id,loginName:u.username,normalizedLogin:u.username}})
   return actor(u)
  }
  admin=await make('ADMIN');second=await make('ADMIN');target=await make('TEACHER')
  organizationId=(await db.organization.create({data:{id:randomUUID(),name:'School audit isolated fixture '+randomUUID(),productDomain:'SCHOOL',createdByUserId:admin.userId}})).id
  for(const p of [admin,second,target]){
   const m=await db.organizationMembership.create({data:{id:randomUUID(),organizationId,userId:p.userId,orgRole:p===target?'MEMBER':'ORG_ADMIN'}})
   if(p===admin)await grantSyntheticHuischoolProduct(db,{organizationId,adminUserId:p.userId,adminMembershipId:m.id})
   if(p===second)await db.educationProductRoleGrant.create({data:{id:randomUUID(),organizationId,membershipId:m.id,product:'HUISCHOOL',role:'PRODUCT_ADMIN',grantedByUserId:admin.userId}})
  }
 })
 afterAll(async()=>{await db?.$disconnect()})
 it.each(['READING','ASSIGNMENT','CHECKIN'] as const)('lists, revises, rejects stale edits and removes a %s draft without crossing activities',async kind=>{
  const activity=await createCampusActivity({actor:admin,organizationId,title:'草稿维护 '+kind,purpose:'LEARNING_ADAPTATION'})
  const scope={actor:admin,organizationId,courseId:activity.id}
  const task=await addCampusActivityTask({...scope,kind,title:'待校正',content:'原正文'})
  const initial=(await listCampusActivityContent(scope)).list.find(row=>row.id===task.id)!
  await changeCampusActivityContent({...scope,kind,taskId:task.id,expectedUpdatedAt:initial.updatedAt,action:'UPDATE',title:'已校正',content:'修订正文'})
  await expect(changeCampusActivityContent({...scope,kind,taskId:task.id,expectedUpdatedAt:initial.updatedAt,action:'UPDATE',title:'过期覆盖',content:'不得保存'})).rejects.toMatchObject({code:'ACTIVITY_TASK_STALE'})
  const changed=(await listCampusActivityContent(scope)).list.find(row=>row.id===task.id)!
  expect(changed.title).toBe('已校正');expect(changed.content).toBe('修订正文')
  const other=await createCampusActivity({actor:admin,organizationId,title:'另一草稿',purpose:'FAMILY_SUPPORT'})
  await expect(changeCampusActivityContent({...scope,courseId:other.id,kind,taskId:task.id,expectedUpdatedAt:changed.updatedAt,action:'REMOVE'})).rejects.toMatchObject({code:'ACTIVITY_TASK_NOT_FOUND',statusCode:404})
  await changeCampusActivityContent({...scope,kind,taskId:task.id,expectedUpdatedAt:changed.updatedAt,action:'REMOVE'})
  expect((await listCampusActivityContent(scope)).list).toHaveLength(0)
 })
 it('serializes competing edits and rejects both update and remove after leaving DRAFT',async()=>{
  const activity=await createCampusActivity({actor:admin,organizationId,title:'并发与冻结',purpose:'LEARNING_ADAPTATION'})
  const scope={actor:admin,organizationId,courseId:activity.id}
  const task=await addCampusActivityTask({...scope,kind:'READING',title:'并发正文'})
  const row=(await listCampusActivityContent(scope)).list[0]
  const input={...scope,kind:'READING' as const,taskId:task.id,expectedUpdatedAt:row.updatedAt,action:'UPDATE' as const,content:'独立修订'}
  const results=await Promise.allSettled(['甲修订','乙修订'].map(title=>changeCampusActivityContent({...input,title})))
  expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1)
  expect(results.find(r=>r.status==='rejected')).toMatchObject({reason:{code:'ACTIVITY_TASK_STALE'}})
  await expect(listCampusActivityContent({...scope,actor:target})).rejects.toMatchObject({statusCode:403})
  await changeCampusActivityStatus({...scope,action:'SUBMIT',expectedVersion:1})
  for(const action of ['UPDATE','REMOVE'] as const)await expect(changeCampusActivityContent({...input,action,title:'不可改写'})).rejects.toMatchObject({code:'ACTIVITY_TASK_FROZEN'})
  expect((await listCampusActivityContent(scope)).list).toHaveLength(1)
 })
 it('lists only current eligible targets, rejects same-person approval and duplicate requests, then revokes the old target credentials',async()=>{
  await db.campusMfaCredential.create({data:{userId:target.userId,secretCipher:'synthetic-test-only',enabled:true,lastUsedStep:BigInt(0)}})
  const scope={actor:admin,organizationId}
  await expect(listSchoolMfaResets({...scope,actor:target})).rejects.toMatchObject({code:'MFA_RESET_AUTH_REQUIRED'})
  expect((await listSchoolMfaResets(scope)).targets.map(t=>t.userId)).toContain(target.userId)
  const request=await requestSchoolMfaReset({...scope,targetUserId:target.userId,reasonCode:'DEVICE_LOST'})
  const own=await listSchoolMfaResets(scope)
  expect(own.targets.some(t=>t.userId===target.userId)).toBe(false)
  expect(own.requests.find(r=>r.id===request.requestId)?.canApprove).toBe(false)
  await expect(requestSchoolMfaReset({...scope,targetUserId:target.userId,reasonCode:'DEVICE_LOST'})).rejects.toMatchObject({code:'MFA_RESET_REQUEST_PENDING'})
  await expect(approveSchoolMfaReset({...scope,requestId:request.requestId})).rejects.toMatchObject({code:'TWO_OFFICERS_REQUIRED'})
  const independent=await listSchoolMfaResets({...scope,actor:second})
  expect(independent.requests.find(r=>r.id===request.requestId)?.canApprove).toBe(true)
  await approveSchoolMfaReset({...scope,actor:second,requestId:request.requestId})
  expect((await db.campusMfaCredential.findUniqueOrThrow({where:{userId:target.userId}})).enabled).toBe(false)
  expect((await db.user.findUniqueOrThrow({where:{id:target.userId}})).tokenVersion).toBe(1)
  await expect(approveSchoolMfaReset({...scope,actor:second,requestId:request.requestId})).rejects.toMatchObject({code:'MFA_RESET_REQUEST_UNAVAILABLE'})
 })
})
