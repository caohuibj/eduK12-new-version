/** New isolated clone: existing full R and already-supported explicit empty R.
 * This does not register or qualify any unpublished fun report material. */
import {randomUUID} from 'node:crypto'
import {writeFile} from 'node:fs/promises'
import {beforeAll,afterAll,describe,it,expect} from 'vitest'
import {requireIsolatedReleaseDatabase} from '../integration/integration-env'
const suite=process.env.PRECISE_EDUCATION_CATALOG_CROSS_REPORT==='1'?describe:describe.skip
suite('education same-tool report variants remain unambiguous across source pages',()=>{
 let db:any,original:any,alternate:any,teacher:any,root:any,system:any,c:any,full:any,empty:any,service:any,list:any
 const proof={adminVerifiedAt:Math.floor(Date.now()/1000),adminSessionId:randomUUID()}
 const name='管理员固定使用配置',observations:any[]=[]
 beforeAll(async()=>{
  const url=process.env.PRECISE_EDUCATION_TEST_DATABASE_URL
  if(!url)throw Error('Explicit new cross-report clone required');requireIsolatedReleaseDatabase(url)
  if(process.env.NODE_ENV!=='test'||new URL(url).pathname!=='/precise_education_catalog_cross_r_test_20261029'||new URL(url).port!=='55439')throw Error('Dedicated cross-report clone required')
  db=(await import('../../config/database')).prisma
  if(await db.user.count()!==8||await db.contentCapabilityGrant.count()!==5)throw Error('Inspect retained outcomes before retry')
  teacher=await db.contentCapabilityGrant.findFirstOrThrow({where:{product:'TEACHER',capabilities:{equals:['material.use']}}})
  root=await db.contentCapabilityGrant.findFirstOrThrow({where:{product:'TEACHER',capabilities:{equals:['material.distribute']}}})
  expect(root.revokedAt).toBeNull()
  system=await db.user.findFirstOrThrow({where:{platformRole:'SYSTEM_ADMIN'}})
  original=await (await import('../../modules/survey/standard-triplet.service')).standardReleaseRow(db,teacher.resourceKeys[0].split(':')[2])
  c={entry:'TEACHER',organizationId:teacher.scopeId,principal:{userId:teacher.subjectId,accountDomain:'SCHOOL'}}
  service=await import('../../modules/assessment-authorization/education-standard-use')
  list=(await import('../../modules/education-tools/public-source.catalog')).listEducationPublicSources
 },30000)
 afterAll(async()=>{
  await writeFile(process.env.PRECISE_EDUCATION_CATALOG_CROSS_REPORT_EVIDENCE??'/tmp/education-catalog-cross-report.json',JSON.stringify({
   productionAccessed:false,reportScope:'Existing full and explicit none-v1 only; no fun registry',observations},null,2)+'\n')
  if(db){await (await import('../../config/queue')).closeQueues(true);await db.$disconnect()}
 })
 it('normally approves the existing empty R with identical C/P and the original M, without creating a report registry',async()=>{
  const triplets=await import('../../modules/survey/standard-triplet.service')
  const none=(await import('../../modules/survey/standard-triplet.model')).registeredParts(original.tool_key).find(part=>part.axis==='REPORT'&&part.payload===null)!
  const selection={toolKey:original.tool_key,CONTENT:original.snapshot.parts.CONTENT.hash,PARAMETERS:original.snapshot.parts.PARAMETERS.hash,REPORT:none.hash}
  const preview=await triplets.previewStandardTriplet(db,system.id,selection)
  const approved=await triplets.approveStandardTriplet(system.id,{...selection,requestId:randomUUID(),expectedCombinationHash:preview.combinationHash,
   reason:'Synthetic existing no-feedback report variant for directory ambiguity',allowedProducts:['TEACHER']},{...proof,tokenVersion:system.tokenVersion})
  expect(approved.state,approved.blockers.join(';')).toBe('ONLINE')
  alternate=await triplets.standardReleaseRow(db,approved.id)
  expect(alternate.snapshot.parts.CONTENT.hash).toBe(original.snapshot.parts.CONTENT.hash)
  expect(alternate.snapshot.parts.PARAMETERS.hash).toBe(original.snapshot.parts.PARAMETERS.hash)
  expect(alternate.snapshot.parts.REPORT.hash).not.toBe(original.snapshot.parts.REPORT.hash)
  expect(alternate.measurement_release).toEqual(original.measurement_release)
  observations.push({original:original.id,alternate:alternate.id,measurement:alternate.measurement_release,contentHash:selection.CONTENT,parameterHash:selection.PARAMETERS})
 },30000)
 it('disables two same-name grants across different R sources, including a name-filtered directory',async()=>{
  if(!alternate)throw Error('Prior normal approval failed; dependent writes forbidden')
  const issue=(row:any)=>service.grantEducationStandardConfigurationUse(teacher.issuerId,{product:'TEACHER',organizationId:teacher.scopeId},row.id,
   {requestId:randomUUID(),userId:teacher.subjectId,combinationHash:row.combination_hash,authorityGrantId:root.id,expectedAuthorityVersion:1,
    validFrom:'2020-01-01T00:00:00Z',expiresAt:'2090-01-01T00:00:00Z',configurationName:name})
  full=await issue(original);empty=await issue(alternate)
  for(const query of [{kind:'SCALE'},{kind:'SCALE',q:name}]){
   const result=await list(c,query),named=result.list.filter((row:any)=>row.configurationName===name)
   expect(named).toHaveLength(2);expect(new Set(named.map((row:any)=>row.sourceId)).size).toBe(2)
   expect(named.every((row:any)=>row.allowedActions.length===0&&row.unavailableReason.includes('同名'))).toBe(true)
  }
  observations.push({sameNamedUseIds:[full.id,empty.id],directoryAmbiguityBlocked:true})
 })
 it('checks off-page same-tool peers using two bounded SQL batches rather than selecting the only visible R',async()=>{
  if(!empty)throw Error('Prior issue failed; dependent reads forbidden')
  const use=await db.contentCapabilityGrant.findUniqueOrThrow({where:{id:empty.id}}),audit=await db.assessmentManagementEvent.findUniqueOrThrow({where:{id:empty.id}})
  let queries=0
  const tx={$queryRaw:(...args:any[])=>{queries++;return db.$queryRaw(...args)}}
  const result=await (await import('../../modules/education-tools/selected-source-catalog')).selectedEducationCatalogChoices(tx as any,c,[{
   key:use.resourceKeys[0],typedUses:[{id:use.id,subject_id:use.subjectId,issuer_id:use.issuerId,resource_keys:use.resourceKeys,
    version:use.version,valid_from:use.validFrom,expires_at:use.expiresAt,actor_id:audit.actorId,metadata:audit.metadata}],
   legacyUseAvailable:false,typedOverflow:false,catalogReadAt:new Date()}])
  expect(queries).toBe(2);expect(result.overflow).toBe(false)
  expect(result.choices.get(use.resourceKeys[0])).toEqual([expect.objectContaining({configurationName:name,ambiguous:true})])
  observations.push({singleSourcePagePeerQueries:queries,offPagePeerBlocked:true})
 })
 it('restores the remaining distinct named option after normal exact-use revocation without modifying either T1',async()=>{
  if(!full||!empty)throw Error('Prior issues failed; dependent revoke forbidden')
  const before=await db.assessmentManagementEvent.findMany({where:{id:{in:[full.id,empty.id]}},orderBy:{id:'asc'}})
  await (await import('../../modules/assessment-authorization/education-standard-revoke')).revokeEducationStandardConfigurationUse(
   teacher.issuerId,{product:'TEACHER',organizationId:teacher.scopeId},original.id,full.id,
   {requestId:randomUUID(),expectedVersion:1,reason:'Synthetic remove duplicate report label'})
  const result=await list(c,{kind:'SCALE',q:name})
  expect(result.list.filter((row:any)=>row.allowedActions.length).map((row:any)=>row.selectedBinding.authorizationId)).toEqual([empty.id])
  expect(await db.assessmentManagementEvent.findMany({where:{id:{in:[full.id,empty.id]}},orderBy:{id:'asc'}})).toEqual(before)
  observations.push({remainingNamedUseId:empty.id,originalT1Unchanged:true})
 })
})
