import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks=vi.hoisted(()=>({policy:vi.fn()}))
vi.mock('../../config/database',()=>({prisma:{}}))
vi.mock('../../modules/assessment-governance/tool-entry-policy',()=>({assertToolEntryPolicy:mocks.policy}))

import { canonicalHash } from '../../modules/assessment-runtime/canonical'
import { encryptUnifiedRuntimePayload } from '../../modules/assessment-runtime/security'
import { compileTrainingFlow, trainingFlowItemKey } from '../../modules/assessment-core/flow/training'
import { createFrozenActiveSlotSet, encryptFrozenActiveSlotSet } from '../../modules/assessment-runtime/slot-set'
import { buildTrainingFlowUnits } from '../../modules/composite/training-flow-definition'
import { resolveTrainingFlowScope, resolveTrainingFlowScopeForMaterialization } from '../../modules/composite/training-flow-scope'
import { assertTrainingScaleCollectionAllowed } from '../../modules/scale/scale-collection-guard'

beforeEach(()=>{
 vi.resetAllMocks();vi.stubEnv('DATA_ENCRYPTION_KEY','e'.repeat(64))
 mocks.policy.mockRejectedValue(new Error('MUTABLE_TRAINING_ENTRY_REVOKED'))
})
afterEach(()=>vi.unstubAllEnvs())

function fixture(){
 const hash='a'.repeat(64)
 const items=['current','future'].map((id,position)=>({id,type:'SCALE',required:true,position,scaleId:`scale-${id}`,standardCombinationSource:null}))
 const composite:any={id:'product',productKind:'QUESTIONNAIRE',publishedAt:new Date('2026-10-01'),items,formSections:[],
  trainingVariantDraft:null,trainingVariantFrozen:null,trainingVariantDigest:null,trainingFlowDraft:null}
 const config=compileTrainingFlow({schemaVersion:1,blocks:items.map(item=>({blockKey:item.id,kind:'INSTRUMENT',instrumentKey:trainingFlowItemKey(item.id)}))},buildTrainingFlowUnits(composite))
 composite.trainingFlowFrozen=config;composite.trainingFlowDigest=config.flowDigest
 const slots=createFrozenActiveSlotSet({schemaVersion:1,runtimeGeneration:'UNIFIED_V1',attemptEpoch:1,slots:items.map(item=>({
  slotKey:`scale:${item.id}`,unitType:'SCALE',required:true,sourceDefinitionIdentity:{key:item.scaleId,version:'1',hash},
  sourceBinding:{compositeItemId:item.id,compiledRuntimeHash:hash},
 }))})
 const candidate={schemaVersion:1,compositeId:composite.id,publishedAt:composite.publishedAt.toISOString(),attemptId:'parent',attemptEpoch:1,
  flowDigest:config.flowDigest,slotSetHash:slots.snapshotHash,references:Object.fromEntries(items.map(item=>[item.id,`runtime-${item.id}`])),assignments:{},situational:{}}
 const parent:any={id:'parent',compositeAssessmentId:composite.id,userId:'student',status:'IN_PROGRESS',attemptEpoch:1,
  runtimeGeneration:'UNIFIED_V1',deliveryMode:'FINAL_ONLY',trainingVariantAllocationEncrypted:null,trainingVariantAllocationHash:null,
  trainingFlowSnapshotEncrypted:encryptUnifiedRuntimePayload(candidate),trainingFlowSnapshotHash:canonicalHash(candidate),
  trainingFlowPathEncrypted:null,trainingFlowPathHash:null,frozenActiveSlotSetEncrypted:encryptFrozenActiveSlotSet(slots),
  frozenActiveSlotSetHash:slots.snapshotHash,contextSnapshotHash:null}
 const state={stopped:false}
 const tx:any={assessmentUnitSnapshot:{findMany:vi.fn().mockResolvedValue([])},$queryRaw:vi.fn(async(query:any)=>{
  const sql=String(query.sql??query)
  if(sql.includes('FROM composite_assessment_attempts a WHERE')||sql.includes('FROM assessments a'))return []
  if(sql.includes('SELECT id,measurement_release_id FROM scales'))return [{id:'scale-current',measurement_release_id:null}]
  if(sql.includes('scale_library_emergency_stops'))return state.stopped?[{target_id:'scale-current'}]:[]
  if(sql.includes('SELECT s.code,s.instrument_version'))return [{code:'fixture',instrument_version:'1',instrument_class:'STANDARD',library_entry_id:'entry',measurement_release_id:'release',content_hash:hash}]
  throw new Error(`Unexpected guard query: ${sql}`)
 })}
 const scope=(verified:any)=>({compositeAttemptId:parent.id,compositeAttemptEpoch:parent.attemptEpoch,compositeItemIds:['current'],verifiedFlowMaterialization:verified})
 return {parent,composite,tx,state,scope}
}

// This exercises the real encrypted flow resolver and real shared collection
// guard. It is a boundary contract, not a complete HTTP/child-write acceptance.
describe('verified lazy Training SCALE collection boundary',()=>{
 it('finishes the admitted current candidate without a materialized child or mutable re-admission',async()=>{
  const {parent,composite,tx,scope}=fixture()
  const verified=await resolveTrainingFlowScopeForMaterialization(parent,composite,{db:tx})
  expect(verified?.scope.path.currentInstrumentKey).toBe(trainingFlowItemKey('current'))
  await assertTrainingScaleCollectionAllowed(tx,['scale-current'],scope(verified) as never)
  expect(mocks.policy).not.toHaveBeenCalled()
  expect(tx.assessmentUnitSnapshot.findMany).toHaveBeenCalledTimes(1)
  expect(tx.$queryRaw.mock.calls).toHaveLength(4) // Existing identity/header, child, Scale lock, stop queries only.
  expect(tx.$queryRaw.mock.calls.some(([q]:any)=>q.sql.includes('scale_library_emergency_stops'))).toBe(true)
 })
 it('retains the real shared emergency stop for that same verified unmaterialized candidate',async()=>{
  const {parent,composite,tx,state,scope}=fixture()
  const verified=await resolveTrainingFlowScopeForMaterialization(parent,composite,{db:tx});state.stopped=true
  await expect(assertTrainingScaleCollectionAllowed(tx,['scale-current'],scope(verified) as never)).rejects.toMatchObject({statusCode:409})
  expect(mocks.policy).not.toHaveBeenCalled()
 })
 it.each(['forged','copy','ordinary scope','transaction','parent','epoch','item','future scale','expanded items'] as const)('rejects %s proof or binding without querying admission',async boundary=>{
  const {parent,composite,tx,scope}=fixture()
  const verified=await resolveTrainingFlowScopeForMaterialization(parent,composite,{db:tx})
  const input:any=scope(verified);let db=tx;let ids=['scale-current']
  if(boundary==='forged')input.verifiedFlowMaterialization={scope:verified!.scope,candidate:verified!.candidate}
  if(boundary==='copy')input.verifiedFlowMaterialization={...verified}
  if(boundary==='ordinary scope')input.verifiedFlowMaterialization=await resolveTrainingFlowScope(parent,composite,{db:tx})
  if(boundary==='transaction')db={...tx}
  if(boundary==='parent')input.compositeAttemptId='other-parent'
  if(boundary==='epoch')input.compositeAttemptEpoch=2
  if(boundary==='item')input.compositeItemIds=['future']
  if(boundary==='future scale')ids=['scale-future']
  if(boundary==='expanded items')input.compositeItemIds=['current','future']
  await expect(assertTrainingScaleCollectionAllowed(db,ids,input)).rejects.toMatchObject({statusCode:403,message:'流程物化准入绑定无效'})
  expect(tx.$queryRaw).not.toHaveBeenCalled();expect(mocks.policy).not.toHaveBeenCalled()
 })
 it('does not turn a caller parent/item claim into frozen admission without the verified object',async()=>{
  const {tx}=fixture()
  await expect(assertTrainingScaleCollectionAllowed(tx,['scale-current'],{compositeAttemptId:'parent',compositeItemIds:['current']})).rejects.toThrow('MUTABLE_TRAINING_ENTRY_REVOKED')
  expect(mocks.policy).toHaveBeenCalledOnce()
 })
})
