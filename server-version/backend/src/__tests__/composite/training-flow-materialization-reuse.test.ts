import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks=vi.hoisted(()=>({
  global:{compositeAssessmentAttempt:{findUnique:vi.fn()},$transaction:vi.fn()},
  tx:{$queryRaw:vi.fn(),compositeAssessmentAttempt:{findUnique:vi.fn()},compositeAssessment:{findUnique:vi.fn()},
    assessment:{findFirst:vi.fn(),create:vi.fn()},assessmentUnitSnapshot:{findMany:vi.fn()},materialGrant:{findUnique:vi.fn()}},
  allowed:vi.fn(),runtime:vi.fn(),entry:vi.fn(),projectionBoundary:new Error('fixture reached projection after successful child materialization'),boundary:new Error('fixture reached authorized runtime materialization'),
}))
vi.mock('../../config/database',()=>({prisma:mocks.global}))
vi.mock('../../services/materialGrant',async original=>({...await original<any>(),canUseScale:mocks.allowed}))
vi.mock('../../modules/assessment-runtime/runtime-snapshot',async original=>({...await original<any>(),loadFrozenScaleRuntimeSnapshot:mocks.runtime}))
vi.mock('../../modules/assessment-governance/tool-entry-policy',async original=>({...await original<any>(),assertToolEntryPolicy:mocks.entry}))
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

function fixture(frozen?:any){
  const hash=frozen?.sourceDefinitionHash??'a'.repeat(64),compiledHash=frozen?.compiledRuntime.compiledRuntimeHash??hash,item={id:'scale-item',type:'SCALE',required:true,position:0,scaleId:'scale',
    scale:{id:'scale',code:'scale',instrumentVersion:'1',creatorId:'teacher',status:'PUBLISHED'}}
  const composite:any={id:'product',productKind:'QUESTIONNAIRE',questionnaireType:'COURSE',createdBy:'teacher',creator:{role:'TEACHER'},publishedAt:new Date('2026-10-01'),
    items:[item],formSections:[],trainingVariantDraft:null,trainingVariantFrozen:null,trainingVariantDigest:null,trainingFlowDraft:null}
  const config=compileTrainingFlow({schemaVersion:1,blocks:[{blockKey:'scale',kind:'INSTRUMENT',instrumentKey:trainingFlowItemKey(item.id)}]},buildTrainingFlowUnits(composite))
  composite.trainingFlowFrozen=config;composite.trainingFlowDigest=config.flowDigest
  const slots=createFrozenActiveSlotSet({schemaVersion:1,runtimeGeneration:'UNIFIED_V1',attemptEpoch:1,slots:[{
    slotKey:'scale:scale-item',unitType:'SCALE',required:true,sourceDefinitionIdentity:{key:'scale',version:'1',hash},
    sourceBinding:{compositeItemId:item.id,...(frozen?{scaleCode:'scale'}:{}),compiledRuntimeHash:compiledHash},
  }]})
  const candidate={schemaVersion:1,compositeId:composite.id,publishedAt:composite.publishedAt.toISOString(),attemptId:'attempt',attemptEpoch:1,
    flowDigest:config.flowDigest,slotSetHash:slots.snapshotHash,references:{[item.id]:'runtime-cipher'},assignments:{},situational:{},privateMarker:'CANDIDATE_PRIVATE'}
  const parent:any={id:'attempt',compositeAssessmentId:composite.id,userId:'student',status:'IN_PROGRESS',attemptEpoch:1,
    runtimeGeneration:'UNIFIED_V1',deliveryMode:'FINAL_ONLY',trainingVariantAllocationEncrypted:null,trainingVariantAllocationHash:null,
    trainingFlowSnapshotEncrypted:encryptUnifiedRuntimePayload(candidate),trainingFlowSnapshotHash:canonicalHash(candidate),
    trainingFlowPathEncrypted:null,trainingFlowPathHash:null,frozenActiveSlotSetEncrypted:encryptFrozenActiveSlotSet(slots),
    frozenActiveSlotSetHash:slots.snapshotHash,contextSnapshotHash:null,compositeAssessment:composite}
  mocks.global.compositeAssessmentAttempt.findUnique.mockResolvedValue(parent)
  mocks.tx.compositeAssessmentAttempt.findUnique.mockImplementation(async()=>{
    const {compositeAssessment:_notIncluded,...scalar}=parent
    return scalar
  })
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
  it('rejects an unreadable pending runtime before reaching the collection guard',async()=>{
    const {parent}=fixture()
    mocks.tx.$queryRaw.mockImplementation(async(sql:any)=>String(sql?.sql??sql).includes('scale_library_emergency_stops')?[{target_id:'scale'}]:[{id:'scale',measurement_release_id:null}])
    await expect(getAttemptState(parent.id,{userId:'student'})).rejects.toBe(mocks.boundary)
    expect(mocks.runtime).toHaveBeenCalledExactlyOnceWith('runtime-cipher',mocks.tx)
    expect(mocks.tx.$queryRaw.mock.calls.some(([sql]:any)=>String(sql?.sql??sql).includes('scale_library_emergency_stops'))).toBe(false)
  })

  it.each([false,true])('reaches the actual lazy guard and child creation after ordinary entry withdrawal (emergency=%s)',async stopped=>{
    const {compileResearchScale}=await import('../../modules/survey/builder.compiler')
    const {createFrozenScaleRuntimeSnapshot}=await import('../../modules/assessment-runtime/runtime-snapshot')
    const definition=compileResearchScale('Actual lazy child',{schemaVersion:1,respondentType:'participant_self_report',responseOptions:[{optionKey:'low',label:'Low',score:0},{optionKey:'high',label:'High',score:2}],dimensions:[{dimensionKey:'sum',label:'Sum',direction:'descriptive'}],aggregation:'sum',items:[{itemKey:'i',prompt:'I',required:true,reverse:false,dimensionKeys:['sum']}]})
    const frozen=createFrozenScaleRuntimeSnapshot({instrumentKey:'scale',instrumentVersion:'1',definition})
    const {parent}=fixture(frozen)
    mocks.runtime.mockResolvedValue(frozen);mocks.allowed.mockResolvedValue(false)
    mocks.entry.mockRejectedValue(new Error('MUTABLE_ENTRY_WITHDRAWN'))
    mocks.tx.$queryRaw.mockImplementation(async(query:any)=>{
      const sql=String(query.sql??query)
      if(sql.includes('FROM composite_assessment_attempts a WHERE')||sql.includes('FROM assessments a'))return []
      if(sql.includes('SELECT id,measurement_release_id FROM scales'))return [{id:'scale',measurement_release_id:null}]
      if(sql.includes('scale_library_emergency_stops'))return stopped?[{target_id:'scale'}]:[]
      if(sql.includes('SELECT s.code,s.instrument_version'))throw new Error('Unexpected mutable new-entry query for an admitted frozen candidate')
      return [{id:'attempt'}]
    })
    mocks.tx.assessment.create.mockResolvedValue({id:'actual-lazy-child'})
    // Stop only at the next public projection read, after the materialization
    // transaction completed. The runtime, resolver and guards above are real.
    mocks.global.compositeAssessmentAttempt.findUnique.mockReset().mockResolvedValueOnce(parent).mockRejectedValueOnce(mocks.projectionBoundary)
    const operation=getAttemptState(parent.id,{userId:'student'})
    if(stopped){
      await expect(operation).rejects.toMatchObject({statusCode:409})
      expect(mocks.tx.assessment.create).not.toHaveBeenCalled()
      expect(mocks.global.compositeAssessmentAttempt.findUnique).toHaveBeenCalledTimes(1)
    }else{
      await expect(operation).rejects.toBe(mocks.projectionBoundary)
      expect(mocks.tx.assessment.create).toHaveBeenCalledExactlyOnceWith({data:expect.objectContaining({compositeAttemptId:parent.id,compositeItemId:'scale-item',scaleId:'scale',attemptEpoch:1,runtimeSnapshotEncrypted:'runtime-cipher',compiledRuntimeHash:frozen.compiledRuntime.compiledRuntimeHash})})
      expect(mocks.global.compositeAssessmentAttempt.findUnique).toHaveBeenCalledTimes(2)
    }
    await expect(mocks.tx.compositeAssessmentAttempt.findUnique.mock.results[0].value).resolves.not.toHaveProperty('compositeAssessment')
    expect(mocks.allowed).not.toHaveBeenCalled();expect(mocks.entry).not.toHaveBeenCalled()
    expect(mocks.tx.$queryRaw.mock.calls.some(([query]:any)=>String(query.sql??query).includes('scale_library_emergency_stops'))).toBe(true)
  },15000)
})
