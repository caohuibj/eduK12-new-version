import {randomUUID} from 'node:crypto'
import {beforeAll,afterAll,describe,it,expect} from 'vitest'
import {requireIsolatedReleaseDatabase} from '../integration/integration-env'
const suite=process.env.PRECISE_EDUCATION_MANAGER_REVOKE==='1'?describe:describe.skip
suite('original education manager exact use revoke and concurrent retry, isolated PostgreSQL',()=>{
 let db:any,teacher:any,school:any[],source:any,system:any,revoke:any,firstResult:any
 const scope=(product:'SCHOOL'|'TEACHER')=>({product,organizationId:teacher.scopeId})
 const input=()=>({requestId:randomUUID(),expectedVersion:1,reason:'Synthetic ordinary exact configuration withdrawal'})
 beforeAll(async()=>{
  const url=process.env.PRECISE_EDUCATION_TEST_DATABASE_URL
  if(!url)throw Error('Explicit revoke clone required');requireIsolatedReleaseDatabase(url)
  if(process.env.NODE_ENV!=='test'||new URL(url).pathname!=='/precise_education_manager_revoke_test_20261029'||new URL(url).port!=='55439')throw Error('Dedicated new revoke clone required')
  db=(await import('../../config/database')).prisma
  if(await db.user.count()!==8||await db.contentCapabilityGrant.count()!==5)throw Error('Inspect previous outcomes before retry')
  const uses=await db.contentCapabilityGrant.findMany({where:{capabilities:{equals:['material.use']}}});teacher=uses.find((use:any)=>use.product==='TEACHER');school=uses.filter((use:any)=>use.product==='SCHOOL')
  source=(await import('../../modules/education-tools/public-source.identity')).parseEducationPublicSourceKey(teacher.resourceKeys[0])!
  system=await db.user.findFirstOrThrow({where:{platformRole:'SYSTEM_ADMIN'}})
  revoke=(await import('../../modules/assessment-authorization/education-standard-revoke')).revokeEducationStandardConfigurationUse
 },30000)
 afterAll(async()=>{if(db){await (await import('../../config/queue')).closeQueues(true);await db.$disconnect()}})
 it('does not use system status, another entry, another school or an injected source to take over this manager use',async()=>{
  await expect(revoke(system.id,scope('TEACHER'),source.id,teacher.id,input())).rejects.toMatchObject({statusCode:403})
  await expect(revoke(teacher.issuerId,scope('SCHOOL'),source.id,school[0].id,input())).rejects.toMatchObject({statusCode:403})
  const other=await db.organization.findFirstOrThrow({where:{id:{not:teacher.scopeId}}})
  await expect(revoke(teacher.issuerId,{product:'TEACHER',organizationId:other.id},source.id,teacher.id,input())).rejects.toMatchObject({statusCode:404})
  await expect(revoke(teacher.issuerId,scope('TEACHER'),randomUUID(),teacher.id,input())).rejects.toMatchObject({statusCode:409})
  expect(await db.contentCapabilityGrant.count({where:{capabilities:{equals:['material.use']},revokedAt:{not:null}}})).toBe(0)
 })
 it('revokes the original School use after upstream withdrawal, compares full retry intent and retains original T1 evidence',async()=>{
  const request=input(),original=await db.assessmentManagementEvent.findUniqueOrThrow({where:{id:school[0].id}})
  firstResult=await revoke(school[0].issuerId,scope('SCHOOL'),source.id,school[0].id,request)
  expect(firstResult).toMatchObject({id:school[0].id,version:2,revoked:true,changed:true})
  expect(await revoke(school[0].issuerId,scope('SCHOOL'),source.id,school[0].id,request)).toMatchObject({version:2,replayed:true,changed:false})
  await expect(revoke(school[0].issuerId,scope('SCHOOL'),source.id,school[0].id,{...request,reason:'Changed retry reason'})).rejects.toMatchObject({statusCode:409})
  await expect(revoke(school[1].issuerId,scope('SCHOOL'),source.id,school[1].id,request)).rejects.toMatchObject({statusCode:409})
  expect((await db.assessmentManagementEvent.findUniqueOrThrow({where:{id:school[0].id}})).metadata).toEqual(original.metadata)
 })
 it('serializes two different revoke requests without returning the other request intent as its own success',async()=>{
  if(!firstResult)throw Error('Prior fixture revoke failed; no dependent mutation')
  const outcomes=await Promise.allSettled([input(),input()].map(request=>revoke(school[1].issuerId,scope('SCHOOL'),source.id,school[1].id,request)))
  expect(outcomes.filter(result=>result.status==='fulfilled')).toHaveLength(1)
  const rejected=outcomes.find(result=>result.status==='rejected') as PromiseRejectedResult
  expect(rejected.reason.statusCode).toBe(409)
  const row=await db.contentCapabilityGrant.findUniqueOrThrow({where:{id:school[1].id}});expect(row.version).toBe(2);expect(row.revokedAt).not.toBeNull()
 })
 it('keeps source-withdrawal cleanup and historical readback independent of current source availability',async()=>{
  if(!firstResult)throw Error('Prior fixture revoke failed; no dependent mutation')
  const sourceService=await import('../../modules/survey/standard-triplet.service'),original=await sourceService.standardReleaseRow(db,source.id)
  await sourceService.withdrawStandardTriplet(system.id,source.id,original.version,'Synthetic approved source withdrawn',
   {tokenVersion:system.tokenVersion,adminVerifiedAt:Math.floor(Date.now()/1000),adminSessionId:randomUUID()})
  const management=await import('../../modules/assessment-authorization/education-standard-management')
  expect((await management.educationStandardManagementCatalog(teacher.issuerId,scope('TEACHER'),{})).list[0].assignable).toBe(false)
  const before=await management.educationStandardManagementGrants(teacher.issuerId,scope('TEACHER'),source.id,{})
  const result=await revoke(teacher.issuerId,scope('TEACHER'),source.id,teacher.id,input());expect(result.version).toBe(2)
  const after=await management.educationStandardManagementGrants(teacher.issuerId,scope('TEACHER'),source.id,{})
  expect(after.list[0].revokedAt).not.toBeNull();expect(after.list[0].selectedBinding).toEqual(before.list[0].selectedBinding)
  expect(after.list[0].configuration).toEqual(before.list[0].configuration);expect(await db.contentCapabilityGrant.count()).toBe(5)
 })
})
