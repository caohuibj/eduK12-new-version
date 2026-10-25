import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks=vi.hoisted(()=>({
  global:{compositeAssessmentAttempt:{findUnique:vi.fn()},$transaction:vi.fn()},
  tx:{$queryRaw:vi.fn(),compositeAssessmentAttempt:{findUnique:vi.fn()},compositeAssessment:{findUnique:vi.fn()},
    assessment:{findFirst:vi.fn()},assessmentUnitSnapshot:{findMany:vi.fn()},materialGrant:{findUnique:vi.fn()}},
  allowed:vi.fn(),runtime:vi.fn(),boundary:new Error('fixture reached authorized runtime materialization'),
}))
vi.mock('../../config/database',()=>({prisma:mocks.global}))
vi.mock('../../services/materialGrant',async original=>({...await original<any>(),canUseScale:mocks.allowed}))
vi.mock('../../modules/assessment-runtime/runtime-snapshot',async original=>({...await original<any>(),loadFrozenScaleRuntimeSnapshot:mocks.runtime}))
vi.mock('../../modules/assessment-runtime/security',{spy:true})
vi.mock('../../modules/assessment-runtime/canonical',{spy:true})

import { canonicalHash } from '../../modules/assessment-runtime/canonical'
import { decryptUnifiedRuntimePayload, encryptUnifiedRuntimePayload } from '../../modules/assessment-runtime/security'
import { compileTrainingFlow, trainingFlowItemKey } from '../../modules/assessment-core/flow/training'
import { createFrozenActiveSlotSet, encryptFrozenActiveSlotSet } from '../../modules/assessment-runtime/slot-set'
import { getAttemptState } from '../../modules/composite/composite.service'
import { buildTrainingFlowUnits } from '../../modules/composite/training-flow-definition'
import { resolveTrainingFlowScope } from '../../modules/composite/training-flow-scope'

beforeEach(()=>{
  vi.resetAllMocks();vi.stubEnv('DATA_ENCRYPTION_KEY','e'.repeat(64))
  mocks.global.$transaction.mockImplementation(fn=>fn(mocks.tx))
  mocks.tx.$queryRaw.mockImplementation(async(sql:any)=>String(sql?.sql??sql).includes('scale_library_emergency_stops')?[]:[{id:'attempt'}])
  mocks.tx.assessment.findFirst.mockResolvedValue(null)
  mocks.tx.assessmentUnitSnapshot.findMany.mockResolvedValue([])
  mocks.allowed.mockResolvedValue(true)
  mocks.runtime.mockRejectedValue(mocks.boundary)
})
afterEach(()=>vi.unstubAllEnvs())

function fixture(){
  const hash='a'.repeat(64),item={id:'scale-item',type:'SCALE',required:true,position:0,scaleId:'scale',
    scale:{id:'scale',creatorId:'teacher',status:'PUBLISHED'}}
  const composite:any={id:'product',createdBy:'teacher',creator:{role:'TEACHER'},publishedAt:new Date('2026-10-01'),
    items:[item],formSections:[],trainingVariantDraft:null,trainingVariantFrozen:null,trainingVariantDigest:null,trainingFlowDraft:null}
  const config=compileTrainingFlow({schemaVersion:1,blocks:[{blockKey:'scale',kind:'INSTRUMENT',instrumentKey:trainingFlowItemKey(item.id)}]},buildTrainingFlowUnits(composite))
  composite.trainingFlowFrozen=config;composite.trainingFlowDigest=config.flowDigest
  const slots=createFrozenActiveSlotSet({schemaVersion:1,runtimeGeneration:'UNIFIED_V1',attemptEpoch:1,slots:[{
    slotKey:'scale:scale-item',unitType:'SCALE',required:true,sourceDefinitionIdentity:{key:'scale',version:'1',hash},
    sourceBinding:{compositeItemId:item.id,compiledRuntimeHash:hash},
  }]})
  const candidate={schemaVersion:1,compositeId:composite.id,publishedAt:composite.publishedAt.toISOString(),attemptId:'attempt',attemptEpoch:1,
    flowDigest:config.flowDigest,slotSetHash:slots.snapshotHash,references:{[item.id]:'runtime-cipher'},assignments:{},situational:{},privateMarker:'CANDIDATE_PRIVATE'}
  const parent:any={id:'attempt',compositeAssessmentId:composite.id,userId:'student',status:'IN_PROGRESS',attemptEpoch:1,
    runtimeGeneration:'UNIFIED_V1',deliveryMode:'FINAL_ONLY',trainingVariantAllocationEncrypted:null,trainingVariantAllocationHash:null,
    trainingFlowSnapshotEncrypted:encryptUnifiedRuntimePayload(candidate),trainingFlowSnapshotHash:canonicalHash(candidate),
    trainingFlowPathEncrypted:null,trainingFlowPathHash:null,frozenActiveSlotSetEncrypted:encryptFrozenActiveSlotSet(slots),
    frozenActiveSlotSetHash:slots.snapshotHash,contextSnapshotHash:null,compositeAssessment:composite}
  mocks.global.compositeAssessmentAttempt.findUnique.mockResolvedValue(parent)
  mocks.tx.compositeAssessmentAttempt.findUnique.mockResolvedValue(parent)
  mocks.tx.compositeAssessment.findUnique.mockResolvedValue(composite)
  vi.mocked(canonicalHash).mockClear();vi.mocked(decryptUnifiedRuntimePayload).mockClear()
  return {parent,composite,candidate}
}

describe('locked Training child candidate reuse',()=>{
  it('decrypts and hashes the candidate exactly once before the actual child runtime load',async()=>{
    const {parent}=fixture()
    await expect(getAttemptState(parent.id,{userId:'student'})).rejects.toBe(mocks.boundary)
    expect(vi.mocked(decryptUnifiedRuntimePayload).mock.calls.filter(([cipher])=>cipher===parent.trainingFlowSnapshotEncrypted)).toHaveLength(1)
    expect(vi.mocked(canonicalHash).mock.calls.filter(([value])=>(value as any)?.privateMarker==='CANDIDATE_PRIVATE')).toHaveLength(1)
    expect(mocks.runtime).toHaveBeenCalledExactlyOnceWith('runtime-cipher',mocks.tx)
    expect(mocks.allowed).not.toHaveBeenCalled() // Frozen delivery does not reacquire ordinary use rights.
    expect(mocks.tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(mocks.tx.compositeAssessmentAttempt.findUnique.mock.invocationCallOrder[0])
  })
  it('does not expose the candidate on ordinary scope results or reuse it across invocations',async()=>{
    const {parent,composite}=fixture()
    for(let i=0;i<2;i++){
      const scope=await resolveTrainingFlowScope(parent,composite,{db:mocks.tx})
      expect(scope).not.toHaveProperty('candidate')
      expect(JSON.stringify(scope)).not.toContain('CANDIDATE_PRIVATE')
    }
    expect(vi.mocked(decryptUnifiedRuntimePayload).mock.calls.filter(([cipher])=>cipher===parent.trainingFlowSnapshotEncrypted)).toHaveLength(2)
  })
  it.each(['hash','candidate epoch','candidate parent','publication'] as const)('rejects %s mismatch before runtime materialization',async boundary=>{
    const {parent,candidate}=fixture()
    if(boundary==='candidate epoch')candidate.attemptEpoch=2
    if(boundary==='candidate parent')candidate.attemptId='other-parent'
    if(boundary==='publication')candidate.publishedAt='2026-10-02T00:00:00.000Z'
    parent.trainingFlowSnapshotEncrypted=encryptUnifiedRuntimePayload(candidate)
    parent.trainingFlowSnapshotHash=boundary==='hash'?'0'.repeat(64):canonicalHash(candidate)
    await expect(getAttemptState(parent.id,{userId:'student'})).rejects.toMatchObject({statusCode:403})
    expect(mocks.runtime).not.toHaveBeenCalled()
  })
  it('retains participant ownership while ordinary grant withdrawal does not interrupt frozen delivery',async()=>{
    const {parent}=fixture()
    await expect(getAttemptState(parent.id,{userId:'outsider'})).rejects.toMatchObject({statusCode:403})
    expect(decryptUnifiedRuntimePayload).not.toHaveBeenCalled()
    mocks.allowed.mockResolvedValue(false)
    await expect(getAttemptState(parent.id,{userId:'student'})).rejects.toBe(mocks.boundary)
    expect(mocks.allowed).not.toHaveBeenCalled()
    expect(mocks.runtime).toHaveBeenCalledExactlyOnceWith('runtime-cipher',mocks.tx)
  })
  it('materializes an admitted pending child after a stop without repeating new-start checks',async()=>{
    const {parent}=fixture()
    mocks.tx.$queryRaw.mockImplementation(async(sql:any)=>String(sql?.sql??sql).includes('scale_library_emergency_stops')?[{target_id:'scale'}]:[{id:'scale',measurement_release_id:null}])
    await expect(getAttemptState(parent.id,{userId:'student'})).rejects.toBe(mocks.boundary)
    expect(mocks.runtime).toHaveBeenCalledExactlyOnceWith('runtime-cipher',mocks.tx)
    expect(mocks.tx.$queryRaw.mock.calls.some(([sql]:any)=>String(sql?.sql??sql).includes('scale_library_emergency_stops'))).toBe(false)
  })
})
