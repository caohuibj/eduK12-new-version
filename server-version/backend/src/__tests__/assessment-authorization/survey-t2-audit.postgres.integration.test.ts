import {randomUUID} from 'node:crypto'
import {writeFile} from 'node:fs/promises'
import {beforeAll,afterAll,describe,it,expect} from 'vitest'
import {requireIsolatedReleaseDatabase} from '../integration/integration-env'
const suite=process.env.PRECISE_T2_SURVEY==='1'?describe:describe.skip
suite('Survey wave changes retain exact original and new T1 identities',()=>{
 let db:any,owner:any,project:any,waiting:any,oldDraft:any,newDraft:any,oldUse:any,newUse:any,waves:any,originalGrants:any,originalPublications:any,originalSources:any,ready=false,extra:any
 const observations:any[]=[],queries:string[]=[]
 const input=(row:any,ids:string[],revision=row.revision)=>({revision,title:row.title,consentText:row.consentText,generalText:row.generalText,instrumentIds:ids})
 const headerQueries=()=>queries.filter(q=>q.includes('LEFT JOIN survey_tool_grants g'))
 const updates=()=>db.surveyEvent.findMany({where:{projectId:project.id,action:'WAVE_DRAFT_UPDATED'},orderBy:{createdAt:'asc'}})
 beforeAll(async()=>{
  const url=process.env.PRECISE_EDUCATION_TEST_DATABASE_URL;if(!url)throw Error('Explicit local Survey T2 clone required');requireIsolatedReleaseDatabase(url)
  if(process.env.NODE_ENV!=='test'||new URL(url).hostname!=='127.0.0.1'||new URL(url).port!=='55439'||new URL(url).pathname!=='/precise_survey_t2_audit_test_20261029')throw Error('Named local Survey T2 clone required')
  db=(await import('../../config/database')).prisma
  const [counts]=await db.$queryRaw`SELECT count(*)::int AS n FROM survey_tool_grants`
  if(await db.user.count()!==11||counts.n!==9||await db.surveyPublication.count()!==5)throw Error('Read retained outcome; no reset/replay')
  project=await db.surveyProject.findFirstOrThrow({where:{title:'Synthetic Survey precise replacement'}});owner=await db.user.findUniqueOrThrow({where:{id:project.ownerUserId}})
  waiting=await db.surveyWave.findFirstOrThrow({where:{projectId:project.id,ordinal:2}});expect(waiting).toMatchObject({revision:0,status:'DRAFT',publicationId:null})
  oldDraft=await db.surveyInstrumentDraft.findUniqueOrThrow({where:{id:waiting.instrumentIds[0]}})
  ;[oldUse]=await db.$queryRaw`SELECT * FROM survey_tool_grants WHERE id=${oldDraft.catalogGrantId}`;expect(oldUse.status).toBe('REVOKED')
  const uses=await db.$queryRaw`SELECT * FROM survey_tool_grants WHERE user_id=${owner.id} AND status='ACTIVE' AND snapshot#>'{provenance,configurationSupersedes}' IS NOT NULL ORDER BY created_at DESC`
  newUse=uses.find((u:any)=>u.snapshot.provenance.selectedBinding.binding.configuration.axes.REPORT.hash!==oldUse.snapshot.provenance.selectedBinding.binding.configuration.axes.REPORT.hash)
  if(!newUse)throw Error('Retained actual exact replacement required')
  originalGrants=await db.$queryRaw`SELECT * FROM survey_tool_grants ORDER BY id`;originalPublications=await db.surveyPublication.findMany({orderBy:{id:'asc'}})
  originalSources=await db.$queryRaw`SELECT * FROM survey_standard_releases ORDER BY id`;waves=await import('../../modules/survey/waves.service')
  if(await db.surveyInstrumentDraft.count({where:{projectId:project.id,instrumentKey:'t2_exact_new'}}))throw Error('Read prior import outcome before retry')
  if((await updates()).length)throw Error('Read existing T2 edits before retry')
  db.$on('query',(event:{query:string})=>queries.push(event.query))
 },60000)
 afterAll(async()=>{
  await writeFile(process.env.PRECISE_T2_EVIDENCE??'/tmp/survey-t2-audit.json',JSON.stringify({productionAccessed:false,
   scope:'Real PostgreSQL research project/import/measurement/wave services. No participant/FINAL or authenticated Survey HTTP replay.',observations},null,2)+'\n')
  if(db){await(await import('../../config/queue')).closeQueues(true);await db.$disconnect()}
 })
 it('replaces an old revoked imported source using exact original headers and records both pointers without report bodies',async()=>{
  const builder=await import('../../modules/survey/builder.service'),measure=await import('../../modules/survey/measurement-publication.service')
  newDraft=await builder.importCatalogDraft(owner.id,project.id,newUse.id,{requestId:randomUUID(),instrumentKey:'t2_exact_new',title:'Synthetic explicit T2 replacement'})
  await measure.publishSurveyMeasurementDraft(owner.id,project.id,newDraft.id,0)
  queries.length=0
  const changed=await waves.updateWave(owner.id,project.id,waiting.id,input(waiting,[newDraft.id]))
  expect(changed).toMatchObject({revision:1,instrumentIds:[newDraft.id]})
  expect(headerQueries()).toHaveLength(1)
  const list=await updates();expect(list).toHaveLength(1)
  const pointer=(use:any)=>{const s=use.snapshot.provenance.selectedBinding;return {authorizationId:use.id,authorizationRevision:1,configurationHash:s.binding.configurationHash,bindingHash:s.bindingHash}}
  expect(list[0]).toMatchObject({actorUserId:owner.id,metadata:{waveId:waiting.id,fromRevision:0,revision:1,selectedSourceChanges:{
   removed:[{slotId:oldDraft.id,selectedBinding:pointer(oldUse),referenceHash:oldUse.snapshot_digest}],added:[{slotId:newDraft.id,selectedBinding:pointer(newUse),referenceHash:newUse.snapshot_digest}]}}})
  const change=list[0].metadata.selectedSourceChanges
  expect(Object.keys(change.removed[0]).sort()).toEqual(['kind','referenceHash','selectedBinding','slotId','sourceHash','sourceId'].sort())
  queries.length=0
  waiting=await waves.updateWave(owner.id,project.id,waiting.id,{...input(changed,[newDraft.id]),generalText:'Only introductory text changed'})
  expect(headerQueries()).toHaveLength(0)
  const after=await updates();expect(after).toHaveLength(2);expect(after[1].metadata.selectedSourceChanges).toBeUndefined()
  await expect(waves.updateWave(owner.id,project.id,waiting.id,input(waiting,[oldDraft.id],0))).rejects.toMatchObject({statusCode:409})
  expect(await updates()).toEqual(after);ready=true
  observations.push({oldRevokedPointer:change.removed[0].selectedBinding,newPointer:change.added[0].selectedBinding,
   changedHeaderQueries:1,ordinaryEditHeaderQueries:0,unchangedBodyHeadersOnly:true,staleEditDenied:true})
 },20000)
 it('audits initial selection once, skips reorder reads and commits only one concurrent wave edit',async()=>{
  if(!ready)throw Error('Prior stage incomplete; dependent mutation forbidden')
  queries.length=0
  const request={requestId:randomUUID(),title:'Synthetic T2 identity order',consentText:'Controlled synthetic data only.',instrumentIds:[oldDraft.id,newDraft.id]}
  extra=await waves.createWave(owner.id,project.id,request);expect(headerQueries()).toHaveLength(1)
  const created=await db.surveyEvent.findFirstOrThrow({where:{projectId:project.id,action:'WAVE_DRAFT_CREATED',metadata:{path:['waveId'],equals:extra.id}}})
  expect(created.metadata.selectedSourceChanges.added).toHaveLength(2)
  const creationEvents=await db.surveyEvent.count({where:{projectId:project.id,action:'WAVE_DRAFT_CREATED'}})
  queries.length=0;expect((await waves.createWave(owner.id,project.id,request)).id).toBe(extra.id)
  expect(headerQueries()).toHaveLength(0);expect(await db.surveyEvent.count({where:{projectId:project.id,action:'WAVE_DRAFT_CREATED'}})).toBe(creationEvents)
  queries.length=0;extra=await waves.updateWave(owner.id,project.id,extra.id,input(extra,[newDraft.id,oldDraft.id]));expect(headerQueries()).toHaveLength(0)
  const reordered=await db.surveyEvent.findFirstOrThrow({where:{projectId:project.id,action:'WAVE_DRAFT_UPDATED',metadata:{path:['waveId'],equals:extra.id}}})
  expect(reordered.metadata.selectedSourceChanges).toBeUndefined()
  const outcomes=await Promise.allSettled([waves.updateWave(owner.id,project.id,extra.id,input(extra,[newDraft.id])),waves.updateWave(owner.id,project.id,extra.id,input(extra,[newDraft.id]))])
  expect(outcomes.filter(o=>o.status==='fulfilled')).toHaveLength(1)
  expect(outcomes.filter(o=>o.status==='rejected')).toHaveLength(1)
  const rejected=outcomes.find(o=>o.status==='rejected') as PromiseRejectedResult;expect(rejected.reason.statusCode).toBe(409)
  const exactUpdates=(await updates()).filter((e:any)=>e.metadata.selectedSourceChanges);expect(exactUpdates).toHaveLength(2)
  expect(await db.$queryRaw`SELECT * FROM survey_tool_grants ORDER BY id`).toEqual(originalGrants)
  expect(await db.surveyPublication.findMany({orderBy:{id:'asc'}})).toEqual(originalPublications)
  expect(await db.$queryRaw`SELECT * FROM survey_standard_releases ORDER BY id`).toEqual(originalSources)
  observations.push({createOnce:true,replayNoAuditOrHeaderRead:true,reorderNoSourceEventOrHeaderRead:true,concurrentOneSuccessOneConflict:true,
   oldGrantsAndFivePublishedSnapshotsUnchanged:true,newImportedDrafts:1,newWave:1})
 },20000)
})
