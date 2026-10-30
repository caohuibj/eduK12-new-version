import {randomUUID} from 'node:crypto'
import {writeFile} from 'node:fs/promises'
import {beforeAll,afterAll,describe,it,expect} from 'vitest'
import {requireIsolatedReleaseDatabase} from '../integration/integration-env'
const suite=process.env.PRECISE_SURVEY_REPLACEMENT==='1'?describe:describe.skip
suite('Survey explicit immutable standard-use replacement',()=>{
 let db:any,manager:any,owner:any,other:any,full:any,empty:any,service:any,builder:any,measure:any,publication:any,baseline:any,oldRow:any,oldEvent:any,oldPublished:any,project:any,waiting:any,waitingWave:any,replacement:any,body:any,sources:any,originalGrants:any
 const observations:any[]=[]
 const ref=(source:any)=>({kind:'SCALE',sourceId:'survey-standard:'+source.id,sourceVersion:source.combination_hash})
 const exact=(name:string)=>({requestId:randomUUID(),configurationName:name})
 async function instrument(grant:any,key:string){
  const draft=await builder.importCatalogDraft(owner.id,project.id,grant.id,{requestId:randomUUID(),instrumentKey:key,title:'固定 '+key})
  await measure.publishSurveyMeasurementDraft(owner.id,project.id,draft.id,0)
  return draft
 }
 async function wave(draft:any,ordinal:number){return db.surveyWave.create({data:{id:randomUUID(),projectId:project.id,title:'Synthetic explicit replacement '+ordinal,ordinal,
  consentText:'This controlled synthetic research wave has no real participants or production data.',instrumentIds:[draft.id]}})}
 beforeAll(async()=>{
  const url=process.env.PRECISE_EDUCATION_TEST_DATABASE_URL
  if(!url)throw Error('Explicit new Survey replacement clone required');requireIsolatedReleaseDatabase(url)
  if(process.env.NODE_ENV!=='test'||new URL(url).hostname!=='127.0.0.1'||new URL(url).port!=='55439'||new URL(url).pathname!=='/precise_survey_replacement_test_20261029')throw Error('Dedicated local Survey replacement clone required')
  db=(await import('../../config/database')).prisma
  const [counts]=await db.$queryRaw`SELECT count(*)::int AS n FROM survey_tool_grants`
  if(await db.user.count()!==11||counts.n!==5||await db.surveyPublication.count()!==3)throw Error('Read retained outcomes before retry; no reset')
  manager=await db.user.findFirstOrThrow({where:{username:{startsWith:'synthetic-survey-manager-'}}})
  const [original]=await db.$queryRaw`SELECT user_id FROM survey_tool_grants WHERE snapshot#>>'{provenance,configurationName}'='固定完整报告'`
  owner=await db.user.findUniqueOrThrow({where:{id:original.user_id}});other=await db.user.findFirstOrThrow({where:{accountDomain:'SURVEY',id:{not:owner.id}}})
  sources=await db.$queryRaw`SELECT id,combination_hash,snapshot,measurement_release,state FROM survey_standard_releases ORDER BY id`
  full=sources.find((row:any)=>row.state==='ONLINE'&&row.snapshot.parts.PARAMETERS.version==='none-v1'&&row.snapshot.parts.REPORT.payload!==null)
  empty=sources.find((row:any)=>row.state==='ONLINE'&&row.snapshot.parts.REPORT.payload===null)
  if(!full||!empty)throw Error('Existing full and absent R exact sources required')
  expect(full.snapshot.parts.CONTENT.hash).toBe(empty.snapshot.parts.CONTENT.hash);expect(full.snapshot.parts.PARAMETERS.hash).toBe(empty.snapshot.parts.PARAMETERS.hash)
  originalGrants=await db.$queryRaw`SELECT * FROM survey_tool_grants ORDER BY id`
  service=await import('../../modules/survey/catalog.service');builder=await import('../../modules/survey/builder.service')
  measure=await import('../../modules/survey/measurement-publication.service');publication=await import('../../modules/survey/publication.service')
 },60000)
 afterAll(async()=>{
  await writeFile(process.env.PRECISE_SURVEY_REPLACEMENT_EVIDENCE??'/tmp/survey-standard-replacement.json',JSON.stringify({productionAccessed:false,
   scope:'Existing full/none R and actual precise grant/import/measurement/frozen-wave services. No scoring/seed/participant/browser replay.',observations},null,2)+'\n')
  if(db){await (await import('../../config/queue')).closeQueues(true);await db.$disconnect()}
 })
 it('prepares a current exact use, immutable published wave and separate waiting source without changing older grants',async()=>{
  baseline=await service.grantCatalogSource(manager.id,owner.id,ref(full),exact('显式替换教学报告'))
  oldRow=(await db.$queryRaw`SELECT * FROM survey_tool_grants WHERE id=${baseline.id}`)[0]
  oldEvent=await db.surveyEvent.findFirstOrThrow({where:{action:'CATALOG_TOOL_GRANTED',metadata:{path:['grantId'],equals:baseline.id}}})
  project=await db.surveyProject.create({data:{id:randomUUID(),ownerUserId:owner.id,title:'Synthetic Survey precise replacement',collectionMode:'SINGLE_UNLINKED'}})
  const first=await instrument(baseline,'before_replacement');waiting=await instrument(baseline,'waiting_original')
  const firstWave=await wave(first,1);waitingWave=await wave(waiting,2)
  const frozen=await publication.freezeResearchWaveDraft({actorUserId:owner.id,projectId:project.id,waveId:firstWave.id,revision:0})
  oldPublished=await db.surveyPublication.findUniqueOrThrow({where:{id:frozen.publicationId}})
  expect(oldPublished.compiledSnapshot.units[0].sourceProvenance.selectedBinding).toEqual(baseline.sourceProvenance.selectedBinding)
  const legacy=(await db.$queryRaw`SELECT id,user_id AS "userId",created_by AS "createdBy",snapshot FROM survey_tool_grants WHERE snapshot#>'{provenance,selectedBinding}' IS NULL LIMIT 1`)[0]
  expect(legacy).toBeTruthy()
  expect(await db.$queryRaw`SELECT * FROM survey_tool_grants WHERE id<>${baseline.id} ORDER BY id`).toEqual(originalGrants)
  observations.push({baselineId:baseline.id,projectId:project.id,waitingId:waiting.id,oldPublicationId:oldPublished.id,originalGrantsUnchanged:true})
 },30000)
 it('rejects legacy, wrong recipient, self replacement, invalid revision and injected lineage before mutation',async()=>{
  if(!oldPublished)throw Error('Prior fixture did not complete, dependent writes forbidden')
  const [legacy]=await db.$queryRaw`SELECT id,user_id AS "userId" FROM survey_tool_grants WHERE snapshot#>'{provenance,selectedBinding}' IS NULL LIMIT 1`
  const intent={...exact('显式替换教学报告'),replaces:{grantId:baseline.id,expectedVersion:1,reason:'Explicit switch to the approved absent report'}}
  await expect(service.grantCatalogSource(manager.id,other.id,ref(empty),intent)).rejects.toMatchObject({statusCode:409})
  await expect(service.grantCatalogSource(manager.id,legacy.userId,ref(empty),{...intent,replaces:{...intent.replaces,grantId:legacy.id}})).rejects.toMatchObject({statusCode:409})
  await expect(service.grantCatalogSource(manager.id,owner.id,ref(empty),{...intent,requestId:baseline.id})).rejects.toMatchObject({statusCode:409})
  await expect(service.grantCatalogSource(manager.id,owner.id,ref(empty),{...intent,replaces:{...intent.replaces,expectedVersion:2}})).rejects.toThrow()
  await expect(service.grantCatalogSource(manager.id,owner.id,ref(empty),{...intent,replaces:{...intent.replaces,selectedBinding:{injected:true}}})).rejects.toThrow()
  expect(await db.$queryRaw`SELECT * FROM survey_tool_grants WHERE id=${baseline.id}`).toEqual([oldRow])
  expect((await db.$queryRaw`SELECT count(*)::int AS n FROM survey_tool_grants`)[0].n).toBe(6)
  body=intent;observations.push({invalidReplacementNoMutation:true})
 })
 it('replaces atomically with the same business name, preserves old T1/waves and freezes the new exact lineage without changing scoring',async()=>{
  if(!body)throw Error('Prior negative checks did not complete, replacement forbidden')
  replacement=await service.grantCatalogSource(manager.id,owner.id,ref(empty),body)
  expect(replacement).toMatchObject({issuerId:manager.id,supersedes:{selectedBinding:baseline.selectedBinding,reason:body.replaces.reason}})
  const [old]=await db.$queryRaw`SELECT * FROM survey_tool_grants WHERE id=${baseline.id}`
  expect(old.status).toBe('REVOKED');expect({...old,status:oldRow.status,revoked_at:oldRow.revoked_at}).toEqual(oldRow)
  expect(await db.surveyEvent.findUniqueOrThrow({where:{id:oldEvent.id}})).toEqual(oldEvent)
  expect(await service.grantCatalogSource(manager.id,owner.id,ref(empty),body)).toMatchObject({id:replacement.id,replayed:true})
  const operation=await service.readExactToolGrantRequest(manager.id,owner.id,body.requestId)
  expect(operation.request).toEqual({...body,userId:owner.id,source:ref(empty)})
  await expect(service.grantCatalogSource(manager.id,owner.id,ref(empty),{...body,replaces:{...body.replaces,reason:'Same id but changed reason'}})).rejects.toMatchObject({statusCode:409})
  await expect(builder.importCatalogDraft(owner.id,project.id,baseline.id,{requestId:randomUUID(),instrumentKey:'stale_import',title:'Blocked old use'})).rejects.toThrow('撤销')
  await expect(publication.freezeResearchWaveDraft({actorUserId:owner.id,projectId:project.id,waveId:waitingWave.id,revision:0})).rejects.toThrow('撤销')
  await expect(db.$transaction((tx:any)=>import('../../modules/survey/tool-policy').then(module=>module.assertSurveyPublicationNotPaused(tx,oldPublished.compiledSnapshot)))).rejects.toThrow('撤销')
  const history=await db.$transaction((tx:any)=>service.catalogSnapshotsForDrafts(tx,owner.id,[baseline.id],false))
  expect(history.get(baseline.id).provenance.selectedBinding).toEqual(baseline.sourceProvenance.selectedBinding)
  expect(await db.surveyPublication.findUniqueOrThrow({where:{id:oldPublished.id}})).toEqual(oldPublished)
  const next=await instrument(replacement,'explicit_new_source'),nextWave=await wave(next,3)
  const frozen=await publication.freezeResearchWaveDraft({actorUserId:owner.id,projectId:project.id,waveId:nextWave.id,revision:0})
  const current=await db.surveyPublication.findUniqueOrThrow({where:{id:frozen.publicationId}}),unit=current.compiledSnapshot.units[0]
  expect(unit.sourceProvenance.selectedBinding).toEqual(replacement.sourceProvenance.selectedBinding);expect(unit.sourceProvenance.configurationSupersedes).toEqual(replacement.supersedes)
  expect(unit.compiledDefinition.report.reportVersion).toBe('none-v1');expect(unit.compiledDefinition.scoring).toEqual(oldPublished.compiledSnapshot.units[0].compiledDefinition.scoring)
  observations.push({replacementId:replacement.id,supersedes:replacement.supersedes,oldUseRevoked:true,oldT1AndPublicationUnchanged:true,oldImportWaitingAndNewAdmissionBlocked:true,newPublicationId:current.id,sourceScoringSame:true})
 },30000)
 it('admits one concurrent next revision and rejects the competing stale replacement without extra grants',async()=>{
  if(!replacement)throw Error('Prior replacement failed; concurrent mutation forbidden')
  const next=(reason:string)=>({...exact('显式替换教学报告'),replaces:{grantId:replacement.id,expectedVersion:1,reason}})
  const requests=[next('Concurrent administrator intent A'),next('Concurrent administrator intent B')]
  const results=await Promise.allSettled(requests.map(input=>service.grantCatalogSource(manager.id,owner.id,ref(full),input)))
  expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);expect(results.filter(r=>r.status==='rejected')).toHaveLength(1)
  const failed=results.find(r=>r.status==='rejected') as PromiseRejectedResult;expect(failed.reason).toMatchObject({statusCode:409})
  expect((await db.$queryRaw`SELECT count(*)::int AS n FROM survey_tool_grants`)[0].n).toBe(8)
  const [old]=await db.$queryRaw`SELECT status,snapshot FROM survey_tool_grants WHERE id=${replacement.id}`;expect(old.status).toBe('REVOKED');expect(old.snapshot.provenance.configurationSupersedes).toEqual(replacement.supersedes)
  expect(await db.$queryRaw`SELECT id,combination_hash,snapshot,measurement_release,state FROM survey_standard_releases ORDER BY id`).toEqual(sources)
  expect(await db.surveyPublication.findUniqueOrThrow({where:{id:oldPublished.id}})).toEqual(oldPublished)
  observations.push({concurrentAccepted:1,concurrentStaleConflict:1,totalGrants:8,originalSourcesUnchanged:true})
 },30000)
})
