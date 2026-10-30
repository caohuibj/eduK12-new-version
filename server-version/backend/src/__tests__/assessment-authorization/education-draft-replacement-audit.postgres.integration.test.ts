import {randomUUID} from 'node:crypto'
import {writeFile} from 'node:fs/promises'
import {beforeAll,afterAll,describe,it,expect} from 'vitest'
import {requireIsolatedReleaseDatabase} from '../integration/integration-env'
import {canonicalHash} from '../../modules/assessment-runtime/canonical'
const suite=process.env.PRECISE_EDUCATION_DRAFT_REPLACEMENT==='1'?describe:describe.skip
suite('education explicit T2 draft source replacement audit',()=>{
 let db:any,c:any,tools:any,waiting:any,oldFixed:any,winner:any,source:any,pin:any,updated:any,fixed:any,allGrants:any
 const observations:any[]=[]
 beforeAll(async()=>{
  const url=process.env.PRECISE_EDUCATION_TEST_DATABASE_URL
  if(!url)throw Error('Explicit retained replacement fixture required');requireIsolatedReleaseDatabase(url)
  if(process.env.NODE_ENV!=='test'||new URL(url).pathname!=='/precise_education_replacement_test_20261029'||new URL(url).port!=='55439')throw Error('Dedicated retained replacement DB required')
  db=(await import('../../config/database')).prisma
  if(await db.user.count()!==8||await db.contentCapabilityGrant.count()!==9||await db.educationPrivateTool.count()!==3||await db.educationPrivateToolVersion.count()!==2)throw Error('Inspect prior replacement outcomes before continuation')
  expect(await db.assessmentManagementEvent.count({where:{action:'EDUCATION_PRIVATE_SOURCE_BINDINGS_CHANGED'}})).toBe(0)
  allGrants=await db.contentCapabilityGrant.findMany({orderBy:{id:'asc'}})
  waiting=await db.educationPrivateTool.findFirstOrThrow({where:{title:'Waiting original no-feedback report'}})
  const oldTool=await db.educationPrivateTool.findFirstOrThrow({where:{title:'Frozen original no-feedback report'}})
  oldFixed=await db.educationPrivateToolVersion.findFirstOrThrow({where:{toolId:oldTool.id}})
  c={entry:'TEACHER',organizationId:waiting.organizationId,principal:{userId:waiting.ownerUserId,accountDomain:'SCHOOL'}}
  ;[winner]=await db.$queryRaw`SELECT g.id,g.resource_keys AS "resourceKeys",e.metadata FROM content_capability_grants g JOIN assessment_management_events e ON e.id=g.id
   WHERE g.product='TEACHER' AND g.revoked_at IS NULL AND e.metadata->>'configurationName' LIKE 'Competing %'`
  if(!winner)throw Error('Known unique winning explicit grant required')
  pin=(await import('../../modules/assessment-authorization/standard-configuration-binding')).selectedConfigurationPointer(winner.metadata.selectedBinding)
  ;[source]=await db.$queryRaw`SELECT id,combination_hash FROM survey_standard_releases WHERE id=${winner.resourceKeys[0].split(':')[2]}`
  tools=await import('../../modules/education-tools/private-tool.service')
 },30000)
 afterAll(async()=>{
  await writeFile(process.env.PRECISE_EDUCATION_DRAFT_REPLACEMENT_EVIDENCE??'/tmp/education-draft-replacement.json',JSON.stringify({productionAccessed:false,
   scope:'Actual explicit old pending draft/new exact grant switch and freeze, immutable original version, unchanged edit and initial selected slot audits; no participant replay',observations},null,2)+'\n')
  if(db){await (await import('../../config/queue')).closeQueues(true);await db.$disconnect()}
 })
 it('rejects hidden source substitution, then audits explicit new-slot replacement and freezes only the chosen new use',async()=>{
  const before=waiting.definition,hidden=structuredClone(before)
  hidden.blocks[0].source={provider:'STANDARD_SCALE',kind:'SCALE',versionId:source.id,contentHash:source.combination_hash,selectedBinding:pin}
  await expect(tools.updatePrivateTool(c,waiting.id,{expectedRevision:waiting.revision,title:waiting.title,definition:hidden})).rejects.toMatchObject({code:'SELECTED_CONFIGURATION_REPLACEMENT_REQUIRED'})
  expect(await db.assessmentManagementEvent.count({where:{action:'EDUCATION_PRIVATE_SOURCE_BINDINGS_CHANGED'}})).toBe(0)
  const explicit=structuredClone(hidden);explicit.blocks[0].blockId=randomUUID()
  updated=await tools.updatePrivateTool(c,waiting.id,{expectedRevision:waiting.revision,title:waiting.title,definition:explicit})
  const audit=await db.assessmentManagementEvent.findFirstOrThrow({where:{resourceId:waiting.id,action:'EDUCATION_PRIVATE_SOURCE_BINDINGS_CHANGED'}})
  expect(audit.actorId).toBe(c.principal.userId)
  const {changeHash,...body}=audit.metadata;expect(changeHash).toBe(canonicalHash(body))
  expect(body).toMatchObject({entry:'TEACHER',organizationId:c.organizationId,previousRevision:waiting.revision,revision:updated.revision,
   previousContentHash:waiting.contentHash,contentHash:updated.contentHash,removed:[{blockId:before.blocks[0].blockId,selectedBinding:before.blocks[0].source.selectedBinding}],
   added:[{blockId:explicit.blocks[0].blockId,selectedBinding:pin}]})
  await expect(tools.updatePrivateTool(c,waiting.id,{expectedRevision:waiting.revision,title:waiting.title,definition:explicit})).rejects.toMatchObject({code:'PRIVATE_TOOL_REVISION_CONFLICT'})
  expect(await db.assessmentManagementEvent.count({where:{action:'EDUCATION_PRIVATE_SOURCE_BINDINGS_CHANGED'}})).toBe(1)
  fixed=await tools.freezePrivateTool(c,waiting.id,{expectedRevision:updated.revision,expectedContentHash:updated.contentHash})
  expect(fixed.definition.blocks[0].source.selectedBinding).toEqual(pin)
  expect(await db.educationPrivateToolVersion.findUniqueOrThrow({where:{id:oldFixed.id}})).toEqual(oldFixed)
  observations.push({toolId:waiting.id,oldRevision:waiting.revision,newRevision:updated.revision,newVersionId:fixed.id,auditId:audit.id,oldFixedUnchanged:true})
 },30000)
 it('allows ordinary prose edits without manufacturing another source-change event or changing an existing frozen version',async()=>{
  if(!fixed)throw Error('Prior explicit replacement failed; dependent edit forbidden')
  const row=await db.educationPrivateTool.findUniqueOrThrow({where:{id:waiting.id}}),definition=structuredClone(row.definition)
  definition.instruction='Only ordinary draft instruction was edited'
  await tools.updatePrivateTool(c,row.id,{expectedRevision:row.revision,title:row.title,definition})
  expect(await db.assessmentManagementEvent.count({where:{action:'EDUCATION_PRIVATE_SOURCE_BINDINGS_CHANGED'}})).toBe(1)
  expect((await db.educationPrivateToolVersion.findUniqueOrThrow({where:{id:fixed.id}})).contentHash).toBe(fixed.contentHash)
  observations.push({ordinaryEditNoBindingEvent:true,frozenVersionUnchanged:true})
 })
 it('records an initial selected slot only after current-use verification and never changes grants',async()=>{
  if(!fixed)throw Error('Prior explicit replacement failed; dependent addition forbidden')
  const created=await tools.createPrivateTool(c,{kind:'COMPOSITION',title:'Initial selected slot with audit'})
  const definition=structuredClone(fixed.definition);definition.blocks[0].blockId=randomUUID()
  const forged=structuredClone(definition);forged.blocks[0].source.selectedBinding.bindingHash='f'.repeat(64)
  await expect(tools.updatePrivateTool(c,created.id,{expectedRevision:1,title:created.title,definition:forged})).rejects.toMatchObject({code:'SELECTED_CONFIGURATION_USE_REQUIRED'})
  expect(await db.assessmentManagementEvent.count({where:{resourceId:created.id,action:'EDUCATION_PRIVATE_SOURCE_BINDINGS_CHANGED'}})).toBe(0)
  await tools.updatePrivateTool(c,created.id,{expectedRevision:1,title:created.title,definition})
  const audit=await db.assessmentManagementEvent.findFirstOrThrow({where:{resourceId:created.id,action:'EDUCATION_PRIVATE_SOURCE_BINDINGS_CHANGED'}})
  expect(audit.metadata.removed).toEqual([]);expect(audit.metadata.added).toEqual([expect.objectContaining({selectedBinding:pin})])
  expect(await db.contentCapabilityGrant.findMany({orderBy:{id:'asc'}})).toEqual(allGrants)
  observations.push({initialToolId:created.id,initialSelectionAudited:true,rejectedPinNoAudit:true,grantsUnchanged:true})
 })
})
