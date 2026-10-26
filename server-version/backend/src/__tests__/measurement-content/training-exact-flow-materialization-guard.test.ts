import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
vi.mock('../../config/database',()=>({prisma:{}}))
import {canonicalHash} from '../../modules/assessment-runtime/canonical'
import {encryptUnifiedRuntimePayload} from '../../modules/assessment-runtime/security'
import {createFrozenScaleRuntimeSnapshot,encryptFrozenScaleRuntimeSnapshot} from '../../modules/assessment-runtime/runtime-snapshot'
import {createFrozenActiveSlotSet,encryptFrozenActiveSlotSet} from '../../modules/assessment-runtime/slot-set'
import {compileTrainingFlow,trainingFlowItemKey} from '../../modules/assessment-core/flow/training'
import {buildTrainingFlowUnits} from '../../modules/composite/training-flow-definition'
import {resolveTrainingFlowScope,resolveTrainingFlowScopeForMaterialization} from '../../modules/composite/training-flow-scope'
import {freezeTrainingStandardReference} from '../../modules/composite/training-standard-combination'
import {prepareTrainingContentAttemptBinding,trainingContentSnapshotSchema} from '../../modules/composite/training-content-binding'
import {assertTrainingStandardCollectionAllowed} from '../../modules/composite/training-standard-collection'
import {ids,tid,trainingSourceHarness} from './training-standard-source.fixture'

beforeEach(()=>vi.stubEnv('DATA_ENCRYPTION_KEY','e'.repeat(64)))
afterEach(()=>vi.unstubAllEnvs())

/** Existing-record doubles, not installation/trial/HTTP acceptance. The encrypted
 * resolver, frozen runtime, parent binding and exact HISTORY validators are real.
 * No throwing runtime sentinel substitutes for the collection result. */
async function fixture(){
 const f=trainingSourceHarness(),futureId=tid(88),composite=f.h.composite
 Object.assign(composite,{status:'PUBLISHED',publishedAt:new Date('2026-10-01'),formSections:[],
  trainingVariantDraft:null,trainingVariantFrozen:null,trainingVariantDigest:null,trainingFlowDraft:null})
 Object.assign(composite.items[0],{required:true,position:0})
 composite.items.push({...composite.items[0],id:futureId,position:1})
 for(const item of composite.items)item.standardCombinationSource=await freezeTrainingStandardReference(f.db,ids.owner,ids.composite,{...f.input,itemId:item.id})
 const snapshot=trainingContentSnapshotSchema.parse({schemaVersion:1,compositeId:composite.id,units:composite.items.map((item:any)=>({
  itemId:item.id,family:'SCALE',source:{kind:'SCALE',id:ids.scale,ownerId:f.h.scale.creatorId,standardCombination:item.standardCombinationSource},
  measurement:item.standardCombinationSource.reference.measurement,
 }))})
 const publicationHash=canonicalHash(snapshot)
 const input={compositeId:composite.id,attemptId:ids.attempt,epoch:1,snapshot,snapshotHash:publicationHash,composite,resolvedSituational:new Map()}
 const bound=await prepareTrainingContentAttemptBinding(f.db,input)
 const config=compileTrainingFlow({schemaVersion:1,blocks:composite.items.map((item:any,index:number)=>({blockKey:'scale_'+index,kind:'INSTRUMENT',instrumentKey:trainingFlowItemKey(item.id)}))},buildTrainingFlowUnits(composite))
 composite.trainingFlowFrozen=config;composite.trainingFlowDigest=config.flowDigest
 const runtime=createFrozenScaleRuntimeSnapshot({instrumentKey:f.h.scale.code,instrumentVersion:f.h.scale.instrumentVersion,definition:f.h.scale.definition})
 const slots=createFrozenActiveSlotSet({schemaVersion:1,runtimeGeneration:'UNIFIED_V1',attemptEpoch:1,slots:composite.items.map((item:any)=>({
  slotKey:`scale:${item.id}`,unitType:'SCALE',required:true,sourceDefinitionIdentity:{key:runtime.instrumentKey,version:runtime.instrumentVersion,hash:runtime.sourceDefinitionHash},
  sourceBinding:{compositeItemId:item.id,compiledRuntimeHash:runtime.compiledRuntime.compiledRuntimeHash},
 }))})
 const cipher=encryptFrozenScaleRuntimeSnapshot(runtime)
 const candidate={schemaVersion:1,compositeId:composite.id,publishedAt:composite.publishedAt.toISOString(),attemptId:ids.attempt,attemptEpoch:1,
  flowDigest:config.flowDigest,slotSetHash:slots.snapshotHash,references:Object.fromEntries(composite.items.map((item:any)=>[item.id,cipher])),assignments:{},situational:{}}
 const parent:any={id:ids.attempt,compositeAssessmentId:composite.id,userId:tid(89),status:'IN_PROGRESS',attemptEpoch:1,
  runtimeGeneration:'UNIFIED_V1',deliveryMode:'FINAL_ONLY',trainingVariantAllocationEncrypted:null,trainingVariantAllocationHash:null,
  trainingFlowSnapshotEncrypted:encryptUnifiedRuntimePayload(candidate),trainingFlowSnapshotHash:canonicalHash(candidate),
  trainingFlowPathEncrypted:null,trainingFlowPathHash:null,frozenActiveSlotSetEncrypted:encryptFrozenActiveSlotSet(slots),
  frozenActiveSlotSetHash:slots.snapshotHash,contextSnapshotHash:null,trainingContentBinding:bound!.binding,trainingContentBindingHash:bound!.bindingHash,
  scaleAssessments:[],compositeAssessment:composite}
 f.db.assessmentUnitSnapshot={findMany:vi.fn().mockResolvedValue([])}
 f.db.compositeAssessmentAttempt={findUnique:vi.fn(async()=>parent)}
 const original=f.db.$queryRaw.getMockImplementation()!
 f.db.$queryRaw.mockImplementation(async(query:any,...args:any[])=>{
  const sql=String(query.sql??query)
  if(sql.includes('FROM composite_assessment_attempts a WHERE'))return [{id:parent.id}]
  return original(query,...args)
 })
 const proof=await resolveTrainingFlowScopeForMaterialization(parent,composite,{db:f.db})
 expect(proof!.scope.path.currentInstrumentKey).toBe(trainingFlowItemKey(ids.item))
 f.h.calls=[];f.db.$queryRaw.mockClear()
 const collect=(verified:any=proof,tx=f.db,parentId=parent.id,itemIds=[ids.item],scaleIds=[ids.scale])=>
  assertTrainingStandardCollectionAllowed(tx,parentId,scaleIds,itemIds,undefined,verified)
 const withdraw=()=>{f.h.use=null;f.h.entryActive=false;f.h.trainingDecision='RETURNED';f.root().revoked_at=new Date('2026-10-25');f.h.row.state='WITHDRAWN'}
 return {...f,parent,composite,proof,collect,withdraw,input,futureId}
}

describe('exact STANDARD lazy flow consumes the same frozen parent admission',()=>{
 it('materializes only the real current exact candidate after use and entry withdrawal, validating frozen source identity',async()=>{
  const f=await fixture();f.withdraw();f.h.emergency=true;f.h.scaleStop=true
  expect(f.parent.scaleAssessments).toEqual([])
  expect(await f.collect()).toEqual(new Set([ids.scale]))
  expect(f.h.calls.some(sql=>sql.includes('FROM survey_standard_releases'))).toBe(true)
  expect(f.h.calls.some(sql=>sql.includes('FROM material_grants')||sql.includes('survey_tool_policies')||sql.includes('content_capability_grants'))).toBe(false)
  expect(f.h.writes).toEqual([])
 })
 it('does not admit a new parent START or an unverified lazy item after the same exact use withdrawal',async()=>{
  const f=await fixture();f.withdraw()
  await expect(prepareTrainingContentAttemptBinding(f.db,{...f.input,attemptId:tid(91),epoch:2})).rejects.toThrow('使用授权不可用')
  await expect(assertTrainingStandardCollectionAllowed(f.db,ids.attempt,[ids.scale],[ids.item])).rejects.toThrow('使用授权不可用')
  expect(f.h.writes).toEqual([])
 })
 it.each(['forged','copy','ordinary scope','transaction','parent','epoch','future item','expanded items'] as const)(
  'rejects %s proof instead of borrowing the exact frozen admission',async boundary=>{
   const f=await fixture();f.withdraw()
   let proof:any=f.proof,tx=f.db,parentId=f.parent.id,itemIds=[ids.item]
   if(boundary==='forged')proof={scope:f.proof!.scope,candidate:f.proof!.candidate}
   if(boundary==='copy')proof={...f.proof}
   if(boundary==='ordinary scope')proof=await resolveTrainingFlowScope(f.parent,f.composite,{db:f.db})
   if(boundary==='transaction')tx={...f.db}
   if(boundary==='parent')parentId=tid(90)
   if(boundary==='epoch')f.parent.attemptEpoch=2
   if(boundary==='future item')itemIds=[f.futureId]
   if(boundary==='expanded items')itemIds=[ids.item,f.futureId]
   await expect(f.collect(proof,tx,parentId,itemIds)).rejects.toMatchObject({statusCode:403,message:'流程物化准入绑定无效'})
   expect(f.h.writes).toEqual([])
  })
 it.each(['item reference','measurement','approved axis version'] as const)('retains exact %s validation behind a genuine current proof',async boundary=>{
  const f=await fixture();f.withdraw()
  const item=f.composite.items[0],unit=f.parent.trainingContentBinding.units[0]
  if(boundary==='item reference')item.standardCombinationSource={...item.standardCombinationSource,referenceHash:'f'.repeat(64)}
  if(boundary==='measurement')unit.measurement={...unit.measurement,contentHash:'f'.repeat(64)}
  if(boundary==='approved axis version'){
   const altered=JSON.parse(JSON.stringify(item.standardCombinationSource));altered.reference.combination.axes.REPORT.version='later-report'
   altered.referenceHash=canonicalHash(altered.reference);item.standardCombinationSource=altered;unit.source.standardCombination=altered
  }
  f.parent.trainingContentBindingHash=canonicalHash(f.parent.trainingContentBinding)
  await expect(f.collect()).rejects.toThrow(boundary==='item reference'?'FROZEN_IDENTITY_CHANGED':'CONTENT_IDENTITY_MISMATCH')
  expect(f.h.writes).toEqual([])
 })
})
