/** Continue only the completed, retained first Survey fixture. No replay of
 * original actor/source/import/wave creation and no historical grant repair. */
import {randomUUID} from 'node:crypto'
import {writeFile} from 'node:fs/promises'
import {beforeAll,afterAll,describe,it,expect} from 'vitest'
import {requireIsolatedReleaseDatabase} from '../integration/integration-env'
const suite=process.env.PRECISE_SURVEY_STANDARD_REVISION==='1'?describe:describe.skip
suite('Survey new explicit manager revision does not revive old bindings',()=>{
 let db:any,system:any,manager:any,entry:any,oldGrant:any,oldPublication:any,service:any,current:any,body:any,newPublication:any
 const observations:any[]=[]
 beforeAll(async()=>{
  const url=process.env.PRECISE_EDUCATION_TEST_DATABASE_URL
  if(!url)throw Error('Explicit retained Survey URL required');requireIsolatedReleaseDatabase(url)
  if(process.env.NODE_ENV!=='test'||new URL(url).pathname!=='/precise_survey_standard_use_test_20261029'||new URL(url).port!=='55439')throw Error('Dedicated retained fixture required')
  db=(await import('../../config/database')).prisma
  const [counts]=await db.$queryRaw`SELECT count(*)::int AS n FROM survey_tool_grants`
  if(await db.user.count()!==11||counts.n!==3||await db.surveyPublication.count()!==2)throw Error('Inspect prior Survey outcomes before continuation')
  system=await db.user.findFirstOrThrow({where:{platformRole:'SYSTEM_ADMIN'}})
  manager=await db.user.findFirstOrThrow({where:{username:{startsWith:'synthetic-survey-manager-'}}})
  entry=await db.adminEntryGrant.findUniqueOrThrow({where:{userId_entry:{userId:manager.id,entry:'SURVEY'}}})
  expect(entry.version).toBe(2);expect(entry.revokedAt).not.toBeNull()
  const [row]=await db.$queryRaw`SELECT id,user_id AS "userId",snapshot FROM survey_tool_grants WHERE snapshot#>>'{provenance,configurationName}'='固定完整报告'`
  oldGrant=row
  oldPublication=(await db.surveyPublication.findMany()).find((row:any)=>row.compiledSnapshot.units[0].sourceProvenance.sourceGrantId===oldGrant.id)
  if(!oldPublication)throw Error('Prior frozen original binding required')
  service=await import('../../modules/survey/catalog.service')
 },30000)
 afterAll(async()=>{
  await writeFile(process.env.PRECISE_SURVEY_STANDARD_REVISION_EVIDENCE??'/tmp/survey-standard-revision.json',JSON.stringify({productionAccessed:false,observations},null,2)+'\n')
  if(db){await (await import('../../config/queue')).closeQueues(true);await db.$disconnect()}
 })
 it('normally regrants entry revision3, rejects old revision1, and publishes/admits only a newly explicit use',async()=>{
  await (await import('../../modules/admin-permissions/service')).changeEntryGrant({actorUserId:system.id,targetUserId:manager.id,entry:'SURVEY',active:true,
   expectedVersion:entry.version,reason:'Synthetic new explicit Survey manager revision',actorSession:{tokenVersion:system.tokenVersion,adminVerifiedAt:Math.floor(Date.now()/1000),adminSessionId:randomUUID()}})
  const policy=await import('../../modules/survey/tool-policy')
  await expect(db.$transaction((tx:any)=>policy.assertSurveyPublicationNotPaused(tx,oldPublication.compiledSnapshot))).rejects.toThrow('管理资格已变化')
  body={requestId:randomUUID(),configurationName:'管理员新修订明确配置'}
  current=await service.grantCatalogSource(manager.id,oldGrant.userId,oldGrant.snapshot.ref,body)
  expect(current.sourceProvenance.selectedBinding.binding.authorization.authority).toEqual([{kind:'ENTRY_ADMIN',id:entry.id,revision:3}])
  const builder=await import('../../modules/survey/builder.service'),projectId=oldPublication.projectId
  const draft=await builder.importCatalogDraft(oldGrant.userId,projectId,current.id,{requestId:randomUUID(),instrumentKey:'new_fixed_scale',title:'管理员新配置'})
  await (await import('../../modules/survey/measurement-publication.service')).publishSurveyMeasurementDraft(oldGrant.userId,projectId,draft.id,0)
  const wave=await db.surveyWave.create({data:{id:randomUUID(),projectId,title:'New explicit revision',ordinal:2,
   consentText:'Synthetic informed consent notice for the new explicit revision only.',instrumentIds:[draft.id]}})
  const published=await (await import('../../modules/survey/publication.service')).freezeResearchWaveDraft({actorUserId:oldGrant.userId,projectId,waveId:wave.id,revision:0})
  newPublication=await db.surveyPublication.findUniqueOrThrow({where:{id:published.publicationId}})
  await db.$transaction((tx:any)=>policy.assertSurveyPublicationNotPaused(tx,newPublication.compiledSnapshot))
  expect(await db.surveyPublication.findUniqueOrThrow({where:{id:oldPublication.id}})).toEqual(oldPublication)
  observations.push({oldUseId:oldGrant.id,newUseId:current.id,newAuthorityRevision:3,newPublicationId:newPublication.id,oldBindingNotRevived:true})
 },30000)
 it('normally revokes new use, reads its exact operation and same-request replay without revival, and preserves frozen history',async()=>{
  if(!current||!newPublication)throw Error('Prior explicit new use failed; dependent revoke forbidden')
  await service.revokeToolGrant(manager.id,current.id)
  const read=await service.readExactToolGrantRequest(manager.id,oldGrant.userId,current.id)
  expect(read).toMatchObject({grant:{id:current.id,status:'REVOKED'},request:{...body,source:oldGrant.snapshot.ref}})
  expect(await service.grantCatalogSource(manager.id,oldGrant.userId,oldGrant.snapshot.ref,body)).toMatchObject({id:current.id,status:'REVOKED',replayed:true})
  await expect(db.$transaction((tx:any)=>import('../../modules/survey/tool-policy').then(module=>module.assertSurveyPublicationNotPaused(tx,newPublication.compiledSnapshot)))).rejects.toThrow('授权已撤销')
  const historical=await db.$transaction((tx:any)=>service.catalogSnapshotsForDrafts(tx,oldGrant.userId,[current.id],false))
  expect(historical.get(current.id).provenance.selectedBinding).toEqual(current.sourceProvenance.selectedBinding)
  expect(await db.surveyPublication.findUniqueOrThrow({where:{id:newPublication.id}})).toEqual(newPublication)
  observations.push({newUseRevoked:true,sameRequestRemainsRevoked:true,frozenHistoryUnchanged:true})
 })
})
