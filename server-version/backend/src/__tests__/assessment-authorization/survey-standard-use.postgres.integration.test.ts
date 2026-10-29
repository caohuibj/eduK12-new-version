import {randomUUID} from 'node:crypto'
import {writeFile} from 'node:fs/promises'
import {beforeAll,afterAll,describe,it,expect} from 'vitest'
import {requireIsolatedReleaseDatabase} from '../integration/integration-env'
const suite=process.env.PRECISE_SURVEY_STANDARD_USE==='1'?describe:describe.skip
suite('Survey exact standard grant and frozen original manager authority',()=>{
 let db:any,system:any,manager:any,entry:any,service:any,builder:any,publication:any,first:any,second:any,legacy:any
 const sources:any[]=[],owners:any[]=[],projects:string[]=[],drafts:any[]=[],published:any[]=[],observations:any[]=[]
 const proof={adminVerifiedAt:Math.floor(Date.now()/1000),adminSessionId:randomUUID()}
 const exact={requestId:randomUUID(),configurationName:'固定完整报告'}
 beforeAll(async()=>{
  const url=process.env.PRECISE_EDUCATION_TEST_DATABASE_URL
  if(!url)throw Error('Explicit new Survey clone required');requireIsolatedReleaseDatabase(url)
  if(process.env.NODE_ENV!=='test'||new URL(url).pathname!=='/precise_survey_standard_use_test_20261029'||new URL(url).port!=='55439')throw Error('Dedicated Survey clone required')
  db=(await import('../../config/database')).prisma
  const [counts]=await db.$queryRaw`SELECT count(*)::int AS n FROM survey_tool_grants`
  const resume=process.env.PRECISE_SURVEY_RESUME_INITIALIZATION==='1'
  if(await db.user.count()!==(resume?10:8)||counts.n||await db.surveyProject.count()||await db.surveyAccount.count()!==(resume?1:0))throw Error('Inspect previous Survey outcome before retry')
  system=await db.user.findFirstOrThrow({where:{platformRole:'SYSTEM_ADMIN'}})
  if(resume)manager=await db.user.findFirstOrThrow({where:{username:{startsWith:'synthetic-survey-manager-'}}})
  else{
   manager=await db.user.create({data:{username:'synthetic-survey-manager-'+randomUUID(),passwordHash:'!synthetic-no-login',accountDomain:'TRAINING'}})
   await (await import('../../modules/admin-permissions/service')).changeEntryGrant({actorUserId:system.id,targetUserId:manager.id,entry:'SURVEY',active:true,
    expectedVersion:0,reason:'Synthetic formal Survey manager',actorSession:{...proof,tokenVersion:system.tokenVersion}})
  }
  entry=await db.adminEntryGrant.findUniqueOrThrow({where:{userId_entry:{userId:manager.id,entry:'SURVEY'}}})
  for(let i=0;i<2;i++){
   let owner
   if(resume&&i===0)owner=await db.user.findFirstOrThrow({where:{accountDomain:'SURVEY',username:{startsWith:'exact-survey-'}}})
   else{
    const login='exact-survey-'+randomUUID().replace(/-/g,'').slice(0,18)
    owner=await db.user.create({data:{username:login,passwordHash:'!synthetic-no-login',accountDomain:'SURVEY'}})
    await db.surveyAccount.create({data:{userId:owner.id,loginName:login,normalizedLogin:login}})
    await db.surveyResearcherGrant.create({data:{userId:owner.id,status:'ACTIVE',grantedBy:manager.id}})
    await db.surveyMfaCredential.create({data:{userId:owner.id,enabled:true,secretCipher:'synthetic-only'}})
   }
   const project=await db.surveyProject.create({data:{id:randomUUID(),ownerUserId:owner.id,title:'Synthetic exact Survey '+i,collectionMode:'SINGLE_UNLINKED'}})
   owners.push(owner);projects.push(project.id)
  }
  service=await import('../../modules/survey/catalog.service');builder=await import('../../modules/survey/builder.service')
  publication=await import('../../modules/survey/publication.service')
 },30000)
 afterAll(async()=>{
  await writeFile(process.env.PRECISE_SURVEY_STANDARD_USE_EVIDENCE??'/tmp/survey-standard-use.json',JSON.stringify({productionAccessed:false,
   scope:'Internal service, import, explicit measurement publication, actual frozen waves and new admission guard; no HTTP/browser/participant attempt',observations},null,2)+'\n')
  if(db){await (await import('../../config/queue')).closeQueues(true);await db.$disconnect()}
 })
 it('normally approves two existing R choices with the same C/P and explicit Survey scope',async()=>{
  const triplets=await import('../../modules/survey/standard-triplet.service')
  const [prior]=await db.$queryRaw`SELECT * FROM survey_standard_releases WHERE state='ONLINE' ORDER BY id LIMIT 1`
  const parts=(await import('../../modules/survey/standard-triplet.model')).registeredParts(prior.tool_key)
  const none=parts.find(part=>part.axis==='PARAMETERS'&&part.payload===null)!,empty=parts.find(part=>part.axis==='REPORT'&&part.payload===null)!
  for(const report of [prior.snapshot.parts.REPORT,empty]){
   const selection={toolKey:prior.tool_key,CONTENT:prior.snapshot.parts.CONTENT.hash,PARAMETERS:none.hash,REPORT:report.hash}
   const preview=await triplets.previewStandardTriplet(db,system.id,selection)
   const approved=await triplets.approveStandardTriplet(system.id,{...selection,requestId:randomUUID(),expectedCombinationHash:preview.combinationHash,
    reason:'Synthetic Survey exact C/P with existing report choices',allowedProducts:['SURVEY']},{...proof,tokenVersion:system.tokenVersion})
   expect(approved.state,approved.blockers.join(';')).toBe('ONLINE')
   sources.push({kind:'SCALE',sourceId:'survey-standard:'+approved.id,sourceVersion:approved.combinationHash})
  }
  expect(sources[0].sourceVersion).not.toBe(sources[1].sourceVersion)
  observations.push({sources,reportScope:'Existing full and none-v1 only, no new report registration'})
 },30000)
 it('seals distinct recipient bindings and business names, compares complete idempotent intent, and preserves the legacy path',async()=>{
  if(sources.length!==2)throw Error('Source approval failed; dependent issue forbidden')
  first=await service.grantCatalogSource(manager.id,owners[0].id,sources[0],exact)
  expect(await service.grantCatalogSource(manager.id,owners[0].id,sources[0],exact)).toMatchObject({id:first.id,replayed:true})
  await expect(service.grantCatalogSource(manager.id,owners[1].id,sources[0],exact)).rejects.toMatchObject({statusCode:409})
  await expect(service.grantCatalogSource(manager.id,owners[0].id,sources[0],{...exact,configurationName:'changed'})).rejects.toMatchObject({statusCode:409})
  await expect(service.grantCatalogSource(manager.id,owners[0].id,sources[1],{requestId:randomUUID(),configurationName:exact.configurationName})).rejects.toMatchObject({statusCode:409})
  await expect(service.grantCatalogSource(system.id,owners[1].id,sources[1],{requestId:randomUUID(),configurationName:'system'})).rejects.toThrow()
  second=await service.grantCatalogSource(manager.id,owners[1].id,sources[1],{requestId:randomUUID(),configurationName:'固定无反馈报告'})
  legacy=await service.grantCatalogSource(manager.id,owners[1].id,sources[0])
  expect(legacy.selectedBinding).toBeUndefined()
  const a=first.sourceProvenance.selectedBinding.binding,b=second.sourceProvenance.selectedBinding.binding
  expect(a.configuration.axes.CONTENT).toEqual(b.configuration.axes.CONTENT)
  expect(a.configuration.axes.PARAMETERS).toEqual(b.configuration.axes.PARAMETERS)
  expect(a.configuration.axes.REPORT.hash).not.toBe(b.configuration.axes.REPORT.hash)
  expect(a.authorization.authority).toEqual([{kind:'ENTRY_ADMIN',id:entry.id,revision:entry.version}])
  const read=await service.readExactToolGrantRequest(manager.id,owners[0].id,exact.requestId)
  expect(read.request).toEqual({...exact,userId:owners[0].id,source:sources[0]})
  expect(await service.readExactToolGrantRequest(manager.id,owners[1].id,exact.requestId)).toBeNull()
  expect((await service.listToolGrants(manager.id,owners[0].id)).list[0]).toMatchObject({configurationName:exact.configurationName,selectedBinding:first.selectedBinding})
  observations.push({typedUseIds:[first.id,second.id],legacyUseId:legacy.id,entryId:entry.id,entryRevision:entry.version})
 })
 it('imports exact immutable grants and freezes two real waves without requiring an R selection by the researcher',async()=>{
  if(!second)throw Error('Prior grants failed; dependent import forbidden')
  for(const [index,grant]of [first,second].entries()){
   const draft=await builder.importCatalogDraft(owners[index].id,projects[index],grant.id,{requestId:randomUUID(),instrumentKey:'fixed_scale',title:'已授权量表'})
   expect(draft.readOnly).toBe(true);expect(draft.catalogGrantId).toBe(grant.id);drafts.push(draft)
   await expect(builder.updateDraft(owners[index].id,projects[index],draft.id,{revision:0,title:'replace R',definition:{}})).rejects.toThrow('只读')
   await (await import('../../modules/survey/measurement-publication.service')).publishSurveyMeasurementDraft(owners[index].id,projects[index],draft.id,0)
   const wave=await db.surveyWave.create({data:{id:randomUUID(),projectId:projects[index],title:'Synthetic fixed wave',ordinal:1,
    consentText:'This is a synthetic informed consent notice for a controlled isolated test.',instrumentIds:[draft.id]}})
   const result=await publication.freezeResearchWaveDraft({actorUserId:owners[index].id,projectId:projects[index],waveId:wave.id,revision:0})
   const stored=await db.surveyPublication.findUniqueOrThrow({where:{id:result.publicationId}})
   expect(stored.compiledSnapshot.units[0].sourceProvenance.selectedBinding).toEqual(grant.sourceProvenance.selectedBinding)
   await db.$transaction((tx:any)=>(import('../../modules/survey/tool-policy').then(module=>module.assertSurveyPublicationNotPaused(tx,stored.compiledSnapshot))))
   published.push(stored)
  }
  observations.push({publicationIds:published.map(row=>row.id),draftIds:drafts.map(row=>row.id),frozenBindingsMatch:true})
 },30000)
 it('rejects forged frozen bindings while leaving inactive historical source reads independent from current authorization',async()=>{
  if(published.length!==2)throw Error('Prior publication failed; dependent read forbidden')
  const forged=JSON.parse(JSON.stringify(published[0].compiledSnapshot));forged.units[0].sourceProvenance.selectedBinding=second.sourceProvenance.selectedBinding
  await expect(db.$transaction((tx:any)=>(import('../../modules/survey/tool-policy').then(module=>module.assertSurveyPublicationNotPaused(tx,forged))))).rejects.toThrow('不一致')
  const read=await db.$transaction((tx:any)=>service.catalogSnapshotsForDrafts(tx,owners[0].id,[first.id],false))
  expect(read.get(first.id).provenance.selectedBinding).toEqual(first.sourceProvenance.selectedBinding)
 })
 it('withdraws the original manager entry through the normal system API and blocks new imports/freezes/START without rewriting history',async()=>{
  if(published.length!==2)throw Error('Prior publications failed; dependent revoke forbidden')
  await (await import('../../modules/admin-permissions/service')).changeEntryGrant({actorUserId:system.id,targetUserId:manager.id,entry:'SURVEY',active:false,
   expectedVersion:entry.version,reason:'Synthetic original Survey manager withdrawn',actorSession:{...proof,tokenVersion:system.tokenVersion}})
  await expect(builder.importCatalogDraft(owners[0].id,projects[0],first.id,{requestId:randomUUID(),instrumentKey:'later',title:'Later'})).rejects.toThrow('管理资格已变化')
  await expect((await import('../../modules/survey/measurement-publication.service')).publishSurveyMeasurementDraft(owners[0].id,projects[0],drafts[0].id,0)).rejects.toThrow('管理资格已变化')
  await expect(db.$transaction((tx:any)=>(import('../../modules/survey/tool-policy').then(module=>module.assertSurveyPublicationNotPaused(tx,published[0].compiledSnapshot))))).rejects.toThrow('管理资格已变化')
  const history=await db.$transaction((tx:any)=>service.catalogSnapshotsForDrafts(tx,owners[0].id,[first.id],false))
  expect(history.get(first.id).provenance.selectedBinding).toEqual(first.sourceProvenance.selectedBinding)
  for(const row of published)expect(await db.surveyPublication.findUniqueOrThrow({where:{id:row.id}})).toEqual(row)
  expect((await db.$queryRaw`SELECT count(*)::int AS n FROM survey_tool_grants`)[0].n).toBe(3)
  observations.push({originalEntryWithdrawn:true,newUseBlocked:true,frozenHistoryUnchanged:true})
 })
})
