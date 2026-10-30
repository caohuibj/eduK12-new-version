/** Isolated clone of the retained T1 fixture. This qualifies the real private
 * tool HTTP/freezer and NEW_USE adapter, not a participant lifecycle or browser. */
import {randomUUID} from 'node:crypto'
import {writeFile} from 'node:fs/promises'
import type {Server} from 'node:http'
import {beforeAll,afterAll,describe,it,expect} from 'vitest'
import {requireIsolatedReleaseDatabase} from '../integration/integration-env'
const suite=process.env.PRECISE_EDUCATION_SELECTED_SOURCE==='1'?describe:describe.skip
suite('education original selected use through real draft and immutable version, PostgreSQL',()=>{
 let db:any,c:any,use:any,pin:any,source:any,definition:any,draft:any,saved:any,fixed:any,base='',server:Server|undefined,
  actor:any,sign:any,system:any,second:any,service:any,reader:any
 const requests:any[]=[],proof={adminVerifiedAt:Math.floor(Date.now()/1000),adminSessionId:randomUUID()}
 async function request(method:string,path:string,body?:unknown,status=200){
  const token=sign({userId:actor.id,username:actor.username,role:actor.role,accountDomain:'SCHOOL',tokenVersion:actor.tokenVersion,
   sessionProduct:'HUITEACHER',mfaVerifiedAt:Math.floor(Date.now()/1000)})
  const response=await fetch(base+path,{method,headers:{Cookie:'huiteacher_session='+token,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})})
  const value=await response.json() as any;requests.push({method,path,status:response.status})
  expect(response.status,JSON.stringify(value)).toBe(status);return value.data
 }
 const path=()=>`/teacher/organizations/${c.organizationId}/private-tools`
 const refs=()=>[{family:'BUNDLE',key:fixed.runtime.resourceKey,version:'1.0.0'}]
 beforeAll(async()=>{
  const url=process.env.PRECISE_EDUCATION_TEST_DATABASE_URL
  if(!url)throw Error('Explicit local clone required');requireIsolatedReleaseDatabase(url)
  if(process.env.NODE_ENV!=='test'||new URL(url).pathname!=='/precise_education_binding_test_20261029_v2'||new URL(url).port!=='55439')throw Error('Dedicated fixture clone required')
  db=(await import('../../config/database')).prisma
  if(await db.user.count()!==8||await db.contentCapabilityGrant.count()!==5||await db.educationPrivateTool.count())throw Error('Inspect prior outcomes before retrying')
  use=await db.contentCapabilityGrant.findFirstOrThrow({where:{product:'TEACHER',capabilities:{equals:['material.use']}}})
  const audit=await db.assessmentManagementEvent.findUniqueOrThrow({where:{id:use.id}})
  pin=(await import('../../modules/assessment-authorization/standard-configuration-binding')).selectedConfigurationPointer(audit.metadata.selectedBinding)
  c={entry:'TEACHER',organizationId:use.scopeId,principal:{userId:use.subjectId,accountDomain:'SCHOOL'}}
  actor=await db.user.findUniqueOrThrow({where:{id:use.subjectId}});system=await db.user.findFirstOrThrow({where:{platformRole:'SYSTEM_ADMIN'}})
  const key=(await import('../../modules/education-tools/public-source.identity')).parseEducationPublicSourceKey(use.resourceKeys[0])!
  source={provider:'STANDARD_SCALE',kind:'SCALE',versionId:key.id,contentHash:key.hash,selectedBinding:pin}
  definition={schemaVersion:1,adapterVersion:'1.0.0',administration:{population:'TEACHER',responseMode:'SELF'},instruction:'Synthetic exact use',
   contextFields:[{contextKey:'gradeLevel',formType:'single_choice',formLabel:'年级',formOptions:[{value:'7',label:'七年级'}]}],
   blocks:[{blockId:randomUUID(),instruction:'Original fixed selection',source}]}
  service=await import('../../modules/education-tools/private-tool.service');reader=await import('../../modules/education-tools/private-tool.composition-source')
  sign=(await import('../../utils/jwt')).generateToken
  const express=(await import('express')).default,app=express();app.use(express.json())
  app.use('/teacher/organizations/:organizationId/private-tools',(await import('../../middleware/auth')).authenticateHuiteacher,
   (await import('../../modules/education-tools/private-tool.routes')).educationPrivateToolRouter('TEACHER'))
  app.use((error:any,_req:any,res:any,_next:any)=>res.status(error.statusCode??500).json({code:error.code??'ERROR',message:error.message}))
  server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server!.once('listening',resolve));base='http://127.0.0.1:'+(server.address() as {port:number}).port
 },30000)
 afterAll(async()=>{
  await writeFile(process.env.PRECISE_EDUCATION_SELECTED_SOURCE_EVIDENCE??'/tmp/education-selected-source.json',JSON.stringify({productionAccessed:false,
   scope:'Private tool HTTP + actual DB-sealed freeze + NEW_USE adapter; no Run publication, START or report completion',requests,pin,draftId:draft?.id,versionId:fixed?.id,secondGrant:second?.id},null,2)+'\n')
  if(server){server.closeAllConnections();await new Promise<void>(resolve=>server!.close(()=>resolve()))}
  if(db){await (await import('../../config/queue')).closeQueues(true);await db.$disconnect()}
 })
 it('rejects forged hashes, another authorization revision and a missing grant before persisting a draft reference',async()=>{
  draft=await request('POST',path(),{kind:'COMPOSITION',title:'Synthetic pinned draft'})
  for(const selectedBinding of [{...pin,bindingHash:'f'.repeat(64)},{...pin,authorizationRevision:2},{...pin,authorizationId:randomUUID()}]){
   const rejected={...definition,blocks:[{...definition.blocks[0],source:{...source,selectedBinding}}]}
   await request('PUT',path()+'/'+draft.id,{expectedRevision:1,title:draft.title,definition:rejected},403)
  }
  expect((await db.educationPrivateTool.findUniqueOrThrow({where:{id:draft.id}})).revision).toBe(1)
  saved=await request('PUT',path()+'/'+draft.id,{expectedRevision:1,title:draft.title,definition})
  expect((await request('GET',path()+'/'+draft.id)).definition.blocks[0].source.selectedBinding).toEqual(pin)
 })
 it('requires explicit replacement to drop the selected authorization and seals it in the immutable original version',async()=>{
  if(!saved)throw Error('Prior save failed; dependent fixture mutation is forbidden')
  const stripped=structuredClone(definition);delete stripped.blocks[0].source.selectedBinding
  await request('PUT',path()+'/'+draft.id,{expectedRevision:saved.revision,title:draft.title,definition:stripped},409)
  fixed=await request('POST',path()+'/'+draft.id+'/freeze',{expectedRevision:saved.revision,expectedContentHash:saved.contentHash})
  expect(fixed.definition.blocks[0].source.selectedBinding).toEqual(pin)
  const stored=await db.compositeAssessment.findUniqueOrThrow({where:{id:fixed.runtime.compositeId}})
  expect(stored.trainingContentSnapshot.educationBinding.origin.contentHash).toBe(fixed.contentHash)
  // The existing strict mapping and DB seal are preserved; no extra authority
  // fields or shared random seed are added to executable unit definitions.
  expect(stored.trainingContentSnapshot.educationBinding.manifest[0]).not.toHaveProperty('selectedBinding')
  const result=await db.$transaction((tx:any)=>reader.readPrivateCompositionRunSources(tx,c,refs(),{lockForUse:true}))
  expect(result.get(refs()[0].key).origin.versionId).toBe(fixed.id)
 })
 it('checks both original revisions when distinct immutable configurations are batched, without switching the first version',async()=>{
  if(!fixed)throw Error('Prior freeze failed; dependent fixture mutation is forbidden')
  const root=await db.contentCapabilityGrant.findFirstOrThrow({where:{product:'TEACHER',capabilities:{equals:['material.distribute']}}})
  second=await (await import('../../modules/assessment-authorization/education-standard-use')).grantEducationStandardConfigurationUse(use.issuerId,
   {product:'TEACHER',organizationId:c.organizationId},source.versionId,{requestId:randomUUID(),userId:actor.id,combinationHash:source.contentHash,
    authorityGrantId:root.id,expectedAuthorityVersion:1,validFrom:'2020-01-01T00:00:00Z',expiresAt:'2090-01-01T00:00:00Z'})
  expect(second.id).not.toBe(pin.authorizationId)
  const secondAudit=await db.assessmentManagementEvent.findUniqueOrThrow({where:{id:second.id}})
  const secondPin=(await import('../../modules/assessment-authorization/standard-configuration-binding')).selectedConfigurationPointer(secondAudit.metadata.selectedBinding)
  const duplicate=await service.createPrivateTool(c,{kind:'COMPOSITION',title:'Synthetic subsequent exact grant'})
  const next=structuredClone(definition);next.blocks[0].source.selectedBinding=secondPin
  const changed=await service.updatePrivateTool(c,duplicate.id,{expectedRevision:1,title:duplicate.title,definition:next})
  const later=await service.freezePrivateTool(c,duplicate.id,{expectedRevision:changed.revision,expectedContentHash:changed.contentHash})
  const all=[...refs(),{family:'BUNDLE',key:later.runtime.resourceKey,version:'1.0.0'}]
  const result=await db.$transaction((tx:any)=>reader.readPrivateCompositionRunSources(tx,c,all,{lockForUse:true}))
  expect(result.size).toBe(2)
  expect((await service.readPrivateToolVersion(c,draft.id,fixed.id)).definition.blocks[0].source.selectedBinding).toEqual(pin)
 })
 it('does not replace a revoked selected grant with the active subsequent grant; original immutable content remains readable',async()=>{
  if(!fixed||!second)throw Error('Prior binding batch failed; dependent fixture mutation is forbidden')
  await (await import('../../modules/measurement-content/admin-authority.service')).revokeAdminContentGrant(system.id,{...proof,tokenVersion:system.tokenVersion},use.id,{expectedVersion:1,reason:'Synthetic selected use revoked'})
  const {readEducationPublicUse}=await import('../../modules/education-tools/public-source.catalog')
  expect((await db.$transaction((tx:any)=>readEducationPublicUse(tx,c,use.resourceKeys,true))).size).toBe(1)
  await expect(db.$transaction((tx:any)=>reader.readPrivateCompositionRunSources(tx,c,refs(),{lockForUse:true}))).rejects.toMatchObject({code:'PUBLIC_SOURCE_USE_REQUIRED'})
  const historical=await request('GET',path()+'/'+draft.id+'/versions/'+fixed.id)
  expect(historical.contentHash).toBe(fixed.contentHash);expect(historical.definition.blocks[0].source.selectedBinding).toEqual(pin)
  expect((await db.contentCapabilityGrant.findUniqueOrThrow({where:{id:second.id}})).revokedAt).toBeNull()
 })
})
