import {randomUUID} from 'node:crypto'
import {writeFile} from 'node:fs/promises'
import {beforeAll,afterAll,describe,it,expect} from 'vitest'
import {requireIsolatedReleaseDatabase} from '../integration/integration-env'
const suite=process.env.PRECISE_T2_TRAINING_COPY==='1'?describe:describe.skip
suite('Training copies retain the original precise use revision',()=>{
 let db:any,products:any,actor:any,source:any,stale:any,baseline:any,grants:any,sources:any,negativeComplete=false
 const observations:any[]=[]
 beforeAll(async()=>{
  const url=process.env.PRECISE_EDUCATION_TEST_DATABASE_URL;if(!url)throw Error('Explicit local T2 copy continuation required');requireIsolatedReleaseDatabase(url)
  if(process.env.NODE_ENV!=='test'||new URL(url).hostname!=='127.0.0.1'||new URL(url).port!=='55439'||new URL(url).pathname!=='/precise_training_t2_audit_test_20261029')throw Error('Named local T2 clone required')
  db=(await import('../../config/database')).prisma
  if(await db.compositeAssessment.count()!==12||await db.materialGrant.count()!==4||await db.assessmentManagementEvent.count({where:{action:'TRAINING_DRAFT_SOURCE_BINDINGS_CHANGED'}})!==4||await db.assessmentManagementEvent.count({where:{action:'TRAINING_DRAFT_SOURCE_BINDINGS_COPIED'}})!==0)throw Error('Read retained T2 outcome; do not reset/replay')
  source=await db.compositeAssessment.findFirstOrThrow({where:{name:'Training replacement waiting original'},include:{items:true}})
  expect(source.revision).toBe(8);actor={userId:source.createdBy,role:'TEACHER'}
  stale=await db.compositeAssessment.findFirstOrThrow({where:{name:'Training replacement GENERAL baseline'},include:{items:true}})
  baseline=await db.compositeAssessment.findMany({orderBy:{id:'asc'},include:{items:true}});grants=await db.materialGrant.findMany({orderBy:{id:'asc'}})
  sources=await db.$queryRaw`SELECT * FROM survey_standard_releases ORDER BY id`;products=await import('../../modules/questionnaire-product/service')
 },60000)
 afterAll(async()=>{
  await writeFile(process.env.PRECISE_T2_EVIDENCE??'/tmp/training-t2-copy.json',JSON.stringify({productionAccessed:false,
   scope:'Existing Training copy service and real PostgreSQL transaction. No HTTP or participant scoring replay.',observations},null,2)+'\n')
  if(db){await(await import('../../config/queue')).closeQueues(true);await db.$disconnect()}
 })
 it('rejects copying an old T2 use into the newer revision even when the same combination is currently granted',async()=>{
  const pin=stale.items.find((i:any)=>i.standardCombinationSource).standardCombinationSource.reference.selectedBinding
  expect(pin.authorizationRevision).toBe(5)
  expect(await db.materialGrant.findUniqueOrThrow({where:{id:pin.authorizationId}})).toMatchObject({version:7,revokedAt:null})
  await expect(products.copy(actor,stale.id,{requestId:randomUUID()})).rejects.toMatchObject({statusCode:403,message:'该精确组合的 Training 使用授权不可用'})
  expect(await db.compositeAssessment.findMany({orderBy:{id:'asc'},include:{items:true}})).toEqual(baseline)
  expect(await db.assessmentManagementEvent.count({where:{action:'TRAINING_DRAFT_SOURCE_BINDINGS_COPIED'}})).toBe(0)
  negativeComplete=true;observations.push({originalUseRevision:5,currentPhysicalUseRevision:7,copyDenied:true,transactionRolledBack:true})
 },20000)
 it('copies a still-valid selection with a new container/slot reference and audits it once on original request recovery',async()=>{
  if(!negativeComplete)throw Error('Negative identity check incomplete; dependent copy forbidden')
  const intent={requestId:randomUUID()},row=await products.copy(actor,source.id,intent)
  const copied=await db.compositeAssessment.findUniqueOrThrow({where:{id:row.id},include:{items:true}})
  expect(copied).toMatchObject({status:'DRAFT',revision:0,createdBy:actor.userId})
  const old=source.items.find((i:any)=>i.standardCombinationSource),next=copied.items.find((i:any)=>i.standardCombinationSource)
  expect(next.id).not.toBe(old.id);expect(next.standardCombinationSource.reference.selectedBinding).toEqual(old.standardCombinationSource.reference.selectedBinding)
  expect(next.standardCombinationSource.reference.combination).toEqual(old.standardCombinationSource.reference.combination)
  expect(next.standardCombinationSource.referenceHash).not.toBe(old.standardCombinationSource.referenceHash)
  const event=await db.assessmentManagementEvent.findFirstOrThrow({where:{resourceId:copied.id,action:'TRAINING_DRAFT_SOURCE_BINDINGS_COPIED'}})
  expect(event).toMatchObject({actorId:actor.userId,metadata:{sourceCompositeId:source.id,sourceRevision:8,revision:0,removed:[],
   added:[{slotId:next.id,referenceHash:next.standardCombinationSource.referenceHash,selectedBinding:old.standardCombinationSource.reference.selectedBinding}]}})
  expect((await products.copy(actor,source.id,intent)).id).toBe(copied.id)
  await expect(products.copy(actor,stale.id,intent)).rejects.toMatchObject({statusCode:409})
  expect(await db.assessmentManagementEvent.count({where:{action:'TRAINING_DRAFT_SOURCE_BINDINGS_COPIED'}})).toBe(1)
  expect(await db.compositeAssessment.count()).toBe(13)
  expect(await db.compositeAssessment.findMany({where:{id:{not:copied.id}},orderBy:{id:'asc'},include:{items:true}})).toEqual(baseline)
  expect(await db.materialGrant.findMany({orderBy:{id:'asc'}})).toEqual(grants)
  expect(await db.$queryRaw`SELECT * FROM survey_standard_releases ORDER BY id`).toEqual(sources)
  observations.push({copiedExactRevision:7,newReferenceHash:true,originalRequestRecoverySameDraft:true,oneCopyEvent:true,retainedOriginalTwelveTasksAndGrants:true})
 },20000)
})
