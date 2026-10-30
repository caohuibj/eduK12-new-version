import {randomUUID} from 'node:crypto'
import {beforeAll,afterAll,describe,it,expect} from 'vitest'
import {requireIsolatedReleaseDatabase} from '../integration/integration-env'
const suite=process.env.PRECISE_EDUCATION_SELECTED_CATALOG==='1'?describe:describe.skip
suite('education current named exact configuration directory, isolated PostgreSQL',()=>{
 let db:any,uses:any[],teacher:any,c:any,root:any,system:any,service:any,list:any,first:any,second:any,data:any
 const context=(use:any)=>({entry:use.product,organizationId:use.scopeId,principal:{userId:use.subjectId,accountDomain:'SCHOOL'}})
 beforeAll(async()=>{
  const url=process.env.PRECISE_EDUCATION_TEST_DATABASE_URL
  if(!url)throw Error('Explicit new catalog fixture required');requireIsolatedReleaseDatabase(url)
  if(process.env.NODE_ENV!=='test'||new URL(url).pathname!=='/precise_education_catalog_test_20261029'||new URL(url).port!=='55439')throw Error('Dedicated catalog clone required')
  db=(await import('../../config/database')).prisma
  if(await db.user.count()!==8||await db.contentCapabilityGrant.count()!==5)throw Error('Inspect previous outcomes before retry')
  uses=await db.contentCapabilityGrant.findMany({where:{capabilities:{equals:['material.use']}}});teacher=uses.find((use:any)=>use.product==='TEACHER');c=context(teacher)
  root=await db.contentCapabilityGrant.findFirstOrThrow({where:{product:'TEACHER',capabilities:{equals:['material.distribute']}}})
  system=await db.user.findFirstOrThrow({where:{platformRole:'SYSTEM_ADMIN'}})
  service=await import('../../modules/assessment-authorization/education-standard-use');list=(await import('../../modules/education-tools/public-source.catalog')).listEducationPublicSources
  const source=(await import('../../modules/education-tools/public-source.identity')).parseEducationPublicSourceKey(teacher.resourceKeys[0])!
  data={requestId:randomUUID(),userId:teacher.subjectId,combinationHash:source.hash,authorityGrantId:root.id,expectedAuthorityVersion:1,
   validFrom:'2020-01-01T00:00:00Z',expiresAt:'2090-01-01T00:00:00Z',configurationName:'体验短报告'}
 },30000)
 afterAll(async()=>{if(db){await (await import('../../config/queue')).closeQueues(true);await db.$disconnect()}})
 it('disables typed School use whose original delegation was withdrawn, while uniquely binding the independent Teacher use',async()=>{
  const school=await list(context(uses.find((use:any)=>use.product==='SCHOOL')),{kind:'SCALE'})
  expect(school.list).toHaveLength(1);expect(school.list[0].allowedActions).toEqual([]);expect(school.list[0].selectedBinding).toBeUndefined()
  const visible=await list(c,{kind:'SCALE'});expect(visible.list).toHaveLength(1)
  expect(visible.list[0].selectedBinding.authorizationId).toBe(teacher.id);expect(visible.list[0].allowedActions).toEqual(['REFERENCE_FIXED_VERSION'])
 })
 it('records the administrator business name as immutable issuance intent and refuses a different-name idempotent retry',async()=>{
  const id=teacher.resourceKeys[0].split(':')[2],scope={product:'TEACHER',organizationId:c.organizationId}
  first=await service.grantEducationStandardConfigurationUse(teacher.issuerId,scope,id,data)
  expect(await service.grantEducationStandardConfigurationUse(teacher.issuerId,scope,id,data)).toMatchObject({id:first.id,replayed:true})
  await expect(service.grantEducationStandardConfigurationUse(teacher.issuerId,scope,id,{...data,configurationName:'另一个用途'})).rejects.toMatchObject({statusCode:409})
  second=await service.grantEducationStandardConfigurationUse(teacher.issuerId,scope,id,{...data,requestId:randomUUID(),configurationName:'科研长报告'})
  const audit=await db.assessmentManagementEvent.findUniqueOrThrow({where:{id:first.id}})
  expect(audit.metadata.configurationName).toBe('体验短报告')
 })
 it('offers explicit business choices, disables the unlabelled ambiguity and searches by administrator name without technical selection',async()=>{
  if(!second)throw Error('Prior issuance failed; no dependent mutation')
  const result=await list(c,{kind:'SCALE'});expect(result.list).toHaveLength(3)
  expect(result.list.filter((row:any)=>row.allowedActions.length).map((row:any)=>row.configurationName).sort()).toEqual(['体验短报告','科研长报告'].sort())
  expect(result.list.find((row:any)=>row.selectedBinding.authorizationId===teacher.id).allowedActions).toEqual([])
  expect(new Set(result.list.map((row:any)=>row.catalogKey)).size).toBe(3)
  const searched=await list(c,{kind:'SCALE',q:'科研长'});expect(searched.list).toHaveLength(1);expect(searched.list[0].selectedBinding.authorizationId).toBe(second.id)
 })
 it('does not choose arbitrarily when two live grants have the same name',async()=>{
  if(!second)throw Error('Prior issuance failed; no dependent mutation')
  await service.grantEducationStandardConfigurationUse(teacher.issuerId,{product:'TEACHER',organizationId:c.organizationId},teacher.resourceKeys[0].split(':')[2],{...data,requestId:randomUUID()})
  const result=await list(c,{kind:'SCALE'})
  expect(result.list.filter((row:any)=>row.configurationName==='体验短报告')).toHaveLength(2)
  expect(result.list.filter((row:any)=>row.configurationName==='体验短报告').every((row:any)=>!row.allowedActions.length)).toBe(true)
  expect(result.list.filter((row:any)=>row.allowedActions.length).map((row:any)=>row.configurationName)).toEqual(['科研长报告'])
 })
 it('withdrawing original distribution disables all named choices without rewriting their historical definitions',async()=>{
  if(!first)throw Error('Prior issuance failed; no dependent mutation')
  await (await import('../../modules/measurement-content/admin-authority.service')).revokeAdminContentGrant(system.id,
   {tokenVersion:system.tokenVersion,adminVerifiedAt:Math.floor(Date.now()/1000),adminSessionId:randomUUID()},root.id,{expectedVersion:1,reason:'Synthetic catalog original distribution withdrawn'})
  const result=await list(c,{kind:'SCALE'});expect(result.list).toHaveLength(1);expect(result.list[0].allowedActions).toEqual([]);expect(result.list[0].selectedBinding).toBeUndefined()
  const audit=await db.assessmentManagementEvent.findUniqueOrThrow({where:{id:first.id}})
  expect(audit.metadata.configurationName).toBe(data.configurationName)
  expect(service.readEducationStandardUseBinding(audit.metadata,{id:first.id,issuerId:teacher.issuerId,recipientId:teacher.subjectId,
   scope:{product:'TEACHER',organizationId:c.organizationId},resourceKey:teacher.resourceKeys[0]}).bindingHash).toBe(first.bindingHash)
 })
})
