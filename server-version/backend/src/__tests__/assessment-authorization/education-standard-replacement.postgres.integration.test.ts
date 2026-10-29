import {randomUUID} from 'node:crypto'
import {writeFile} from 'node:fs/promises'
import {beforeAll,afterAll,describe,it,expect} from 'vitest'
import {requireIsolatedReleaseDatabase} from '../integration/integration-env'
const suite=process.env.PRECISE_EDUCATION_REPLACEMENT==='1'?describe:describe.skip
suite('education explicit replacement lineage without draft or report drift',()=>{
 let db:any,use:any,root:any,source:any,oldSource:any,oldAudit:any,c:any,service:any,tools:any,oldPin:any,oldFixed:any,waiting:any,current:any,newFixed:any
 let originalSources:any
 const observations:any[]=[],ids:string[]=[]
 const body=(replaces:any)=>({requestId:randomUUID(),userId:use.subjectId,combinationHash:source.combination_hash,authorityGrantId:root.id,expectedAuthorityVersion:1,
  validFrom:'2020-01-01T00:00:00Z',expiresAt:'2090-01-01T00:00:00Z',configurationName:'管理员明确更新的报告',replaces})
 async function save(pin:any,row:any,title:string,freeze=false){
  const draft=await tools.createPrivateTool(c,{kind:'COMPOSITION',title});ids.push(draft.id)
  const definition={schemaVersion:1,adapterVersion:'1.0.0',administration:{population:'TEACHER',responseMode:'SELF'},instruction:'Synthetic explicit replacement',
   contextFields:[{contextKey:'gradeLevel',formType:'single_choice',formLabel:'年级',formOptions:[{value:'7',label:'七年级'}]}],
   blocks:[{blockId:randomUUID(),instruction:'Original selected use',source:{provider:'STANDARD_SCALE',kind:'SCALE',versionId:row.id,contentHash:row.combination_hash,selectedBinding:pin}}]}
  const saved=await tools.updatePrivateTool(c,draft.id,{expectedRevision:1,title,definition})
  return {draft,saved,fixed:freeze?await tools.freezePrivateTool(c,draft.id,{expectedRevision:saved.revision,expectedContentHash:saved.contentHash}):null}
 }
 beforeAll(async()=>{
  const url=process.env.PRECISE_EDUCATION_TEST_DATABASE_URL
  if(!url)throw Error('Explicit replacement clone required');requireIsolatedReleaseDatabase(url)
  if(process.env.NODE_ENV!=='test'||new URL(url).pathname!=='/precise_education_replacement_test_20261029'||new URL(url).port!=='55439')throw Error('Dedicated replacement clone required')
  db=(await import('../../config/database')).prisma
  if(await db.user.count()!==8||await db.contentCapabilityGrant.count()!==7||await db.educationPrivateTool.count())throw Error('Inspect prior replacement outcome before retry')
  ;[use]=await db.$queryRaw`SELECT g.id,g.subject_id AS "subjectId",g.issuer_id AS "issuerId",g.scope_id AS "scopeId",g.resource_keys AS "resourceKeys"
   FROM content_capability_grants g JOIN assessment_management_events e ON e.id=g.id
   WHERE g.product='TEACHER' AND g.revoked_at IS NULL AND e.metadata->>'configurationName'='管理员固定使用配置'`
  if(!use)throw Error('Retained active empty-R exact grant required')
  root=await db.contentCapabilityGrant.findFirstOrThrow({where:{product:'TEACHER',capabilities:{equals:['material.distribute']}}});expect(root.revokedAt).toBeNull()
  originalSources=await db.$queryRaw`SELECT id,combination_hash,snapshot FROM survey_standard_releases ORDER BY id`
  oldSource=originalSources.find((row:any)=>row.id===use.resourceKeys[0].split(':')[2]);source=originalSources.find((row:any)=>row.id!==oldSource.id)
  expect(oldSource.snapshot.parts.REPORT.payload).toBeNull();expect(source.snapshot.parts.REPORT.payload).not.toBeNull()
  expect(oldSource.snapshot.parts.CONTENT.hash).toBe(source.snapshot.parts.CONTENT.hash);expect(oldSource.snapshot.parts.PARAMETERS.hash).toBe(source.snapshot.parts.PARAMETERS.hash)
  oldAudit=await db.assessmentManagementEvent.findUniqueOrThrow({where:{id:use.id}})
  oldPin=(await import('../../modules/assessment-authorization/standard-configuration-binding')).selectedConfigurationPointer(oldAudit.metadata.selectedBinding)
  c={entry:'TEACHER',organizationId:use.scopeId,principal:{userId:use.subjectId,accountDomain:'SCHOOL'}}
  service=await import('../../modules/assessment-authorization/education-standard-use');tools=await import('../../modules/education-tools/private-tool.service')
 },30000)
 afterAll(async()=>{
  await writeFile(process.env.PRECISE_EDUCATION_REPLACEMENT_EVIDENCE??'/tmp/education-replacement.json',JSON.stringify({productionAccessed:false,
   scope:'Actual old frozen version/old pending draft/new fixed version, atomic explicit use replacement and competing replacements; no participant replay',observations,toolIds:ids},null,2)+'\n')
  if(db){await (await import('../../config/queue')).closeQueues(true);await db.$disconnect()}
 })
 it('prepares a real frozen version and a separate waiting draft, both with the original no-feedback R',async()=>{
  oldFixed=await save(oldPin,oldSource,'Frozen original no-feedback report',true)
  waiting=await save(oldPin,oldSource,'Waiting original no-feedback report')
  expect(oldFixed.fixed.definition.blocks[0].source.selectedBinding).toEqual(oldPin)
  observations.push({oldUseId:use.id,oldFrozenVersionId:oldFixed.fixed.id,waitingDraftId:waiting.draft.id})
 },30000)
 it('rejects stale version, foreign School grant, self request and injected lineage without creating or revoking anything',async()=>{
  const school=await db.contentCapabilityGrant.findFirstOrThrow({where:{product:'SCHOOL',capabilities:{equals:['material.use']}}})
  const before=await db.contentCapabilityGrant.count()
  await expect(service.grantEducationStandardConfigurationUse(use.issuerId,{product:'TEACHER',organizationId:c.organizationId},source.id,body({grantId:use.id,expectedVersion:2,reason:'Stale'}))).rejects.toMatchObject({statusCode:409})
  await expect(service.grantEducationStandardConfigurationUse(use.issuerId,{product:'TEACHER',organizationId:c.organizationId},source.id,body({grantId:school.id,expectedVersion:1,reason:'Wrong entry'}))).rejects.toMatchObject({statusCode:403})
  await expect(service.grantEducationStandardConfigurationUse(use.issuerId,{product:'TEACHER',organizationId:c.organizationId},source.id,{...body({grantId:use.id,expectedVersion:1,reason:'Self'}),requestId:use.id})).rejects.toMatchObject({statusCode:409})
  await expect(service.grantEducationStandardConfigurationUse(use.issuerId,{product:'TEACHER',organizationId:c.organizationId},source.id,body({grantId:use.id,expectedVersion:1,reason:'Injected',selectedBinding:{fake:true}}))).rejects.toThrow()
  expect(await db.contentCapabilityGrant.count()).toBe(before);expect((await db.contentCapabilityGrant.findUniqueOrThrow({where:{id:use.id}})).revokedAt).toBeNull()
 })
 it('atomically issues a new R and lineage, keeps old pending/frozen identity, and never repairs the old draft with the new use',async()=>{
  if(!waiting||!oldFixed?.fixed)throw Error('Prior originals failed; dependent replacement forbidden')
  const input=body({grantId:use.id,expectedVersion:1,reason:'Explicit switch from no-feedback to original full report'})
  current=await service.grantEducationStandardConfigurationUse(use.issuerId,{product:'TEACHER',organizationId:c.organizationId},source.id,input)
  expect(await service.grantEducationStandardConfigurationUse(use.issuerId,{product:'TEACHER',organizationId:c.organizationId},source.id,input)).toMatchObject({id:current.id,replayed:true})
  await expect(service.grantEducationStandardConfigurationUse(use.issuerId,{product:'TEACHER',organizationId:c.organizationId},source.id,{...input,replaces:{...input.replaces,reason:'Different intent'}})).rejects.toMatchObject({statusCode:409})
  const nextAudit=await db.assessmentManagementEvent.findUniqueOrThrow({where:{id:current.id}}),pin=(await import('../../modules/assessment-authorization/standard-configuration-binding')).selectedConfigurationPointer(nextAudit.metadata.selectedBinding)
  expect(nextAudit.metadata.supersedes).toEqual({selectedBinding:oldPin,reason:input.replaces.reason})
  expect((await db.contentCapabilityGrant.findUniqueOrThrow({where:{id:use.id}}))).toMatchObject({version:2,revokedAt:expect.any(Date)})
  expect(await db.assessmentManagementEvent.findUniqueOrThrow({where:{id:use.id}})).toEqual(oldAudit)
  const operation=await (await import('../../modules/assessment-authorization/education-standard-management')).educationStandardManagementOperation(use.issuerId,{product:'TEACHER',organizationId:c.organizationId},source.id,current.id)
  if(!operation||operation.kind!=='ISSUE')throw Error('Expected the actual replacement issuance operation')
  expect(operation.request.replaces).toEqual(input.replaces)
  await expect(tools.freezePrivateTool(c,waiting.draft.id,{expectedRevision:waiting.saved.revision,expectedContentHash:waiting.saved.contentHash})).rejects.toMatchObject({code:'PUBLIC_SOURCE_USE_REQUIRED'})
  expect((await tools.readPrivateTool(c,waiting.draft.id)).definition.blocks[0].source.selectedBinding).toEqual(oldPin)
  expect((await tools.readPrivateToolVersion(c,oldFixed.draft.id,oldFixed.fixed.id)).contentHash).toBe(oldFixed.fixed.contentHash)
  newFixed=await save(pin,source,'New explicitly selected full report',true)
  expect(newFixed.fixed.definition.blocks[0].source.selectedBinding).toEqual(pin)
  expect(await db.$queryRaw`SELECT id,combination_hash,snapshot FROM survey_standard_releases ORDER BY id`).toEqual(originalSources)
  observations.push({newUseId:current.id,newFrozenVersionId:newFixed.fixed.id,oldDraftUnchanged:true,oldFrozenUnchanged:true,sourceDefinitionsUnchanged:true})
 },30000)
 it('serializes two competing explicit replacements and commits exactly one new revision and one old-use revocation',async()=>{
  if(!current||!newFixed?.fixed)throw Error('Prior explicit new use failed; dependent race forbidden')
  const before=await db.contentCapabilityGrant.count(),audit=await db.assessmentManagementEvent.findUniqueOrThrow({where:{id:current.id}})
  const inputs=['one','two'].map(label=>({...body({grantId:current.id,expectedVersion:1,reason:'Synthetic competing '+label}),configurationName:'Competing '+label}))
  const results=await Promise.allSettled(inputs.map(input=>service.grantEducationStandardConfigurationUse(use.issuerId,{product:'TEACHER',organizationId:c.organizationId},source.id,input)))
  expect(results.filter(result=>result.status==='fulfilled')).toHaveLength(1)
  expect(results.filter(result=>result.status==='rejected').map((result:any)=>result.reason.statusCode)).toEqual([409])
  expect(await db.contentCapabilityGrant.count()).toBe(before+1)
  expect(await db.assessmentManagementEvent.findUniqueOrThrow({where:{id:current.id}})).toEqual(audit)
  expect((await db.contentCapabilityGrant.findUniqueOrThrow({where:{id:current.id}}))).toMatchObject({version:2,revokedAt:expect.any(Date)})
  const [events]=await db.$queryRaw`SELECT count(*)::int AS n FROM assessment_management_events WHERE action='EDUCATION_STANDARD_CONFIGURATION_USE_REPLACED'`
  expect(events.n).toBe(2)
  observations.push({race:'one success, one409, exactly one new grant',immutableT1Unchanged:true})
 },30000)
})
