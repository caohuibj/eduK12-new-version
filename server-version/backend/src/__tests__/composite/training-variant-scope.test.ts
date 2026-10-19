import { describe,it,expect,vi } from 'vitest'
vi.mock('../../modules/assessment-runtime/security',()=>({decryptUnifiedRuntimePayload:(v:string)=>JSON.parse(v)}))
vi.mock('../../modules/assessment-runtime/slot-set',()=>({loadFrozenActiveSlotSet:vi.fn(async(v:string)=>JSON.parse(v)),compositeItemSlotKey:(id:string,type:string)=>`${type.toLowerCase()}:${id}`,formSectionSlotKey:(id:string)=>`form-section:${id}`}))
import { canonicalHash } from '../../modules/assessment-runtime/canonical'
import { mapCompositeSection } from '../../modules/assessment-runtime/form-section-definition'
import { compileWeightedVariants, createWeightedVariantAllocation } from '../../modules/assessment-core/weighted-variants'
import { hasTrainingVariantMetadata, buildTrainingVariantUnion, resolveTrainingAttemptScope, applyTrainingAttemptScope } from '../../modules/composite/training-variant-scope'
import { loadFrozenActiveSlotSet } from '../../modules/assessment-runtime/slot-set'
function fixture(){
 const sections=['a','b'].map((id,position)=>({id:`section_${id}`,title:id,description:null,position,contextSection:false,items:[{id:`form_${id}`,type:'FORM',formType:'text_input',formLabel:id,formOptions:[],required:true,position,formSectionPosition:0,contextKey:null,formSectionId:`section_${id}`}]}))
 const composite:any={trainingFlowDraft:null,trainingFlowFrozen:null,trainingFlowDigest:null,id:'composite',publishedAt:new Date('2026-10-18T00:00:00Z'),items:sections.flatMap(s=>s.items),formSections:sections}
 composite.trainingVariantDraft={schemaVersion:1,groups:sections.map((s,i)=>({variantKey:`group_${i}`,label:`Group ${i}`,weight:1,units:[{type:'FORM_SECTION',id:s.id}]}))}
 composite.trainingVariantFrozen=compileWeightedVariants(composite.trainingVariantDraft,buildTrainingVariantUnion(composite));composite.trainingVariantDigest=composite.trainingVariantFrozen.configDigest
 const allocation=createWeightedVariantAllocation(composite.trainingVariantFrozen,{compositeId:'composite',attemptId:'attempt',participantKey:'user:one',attemptEpoch:1,publishedAt:composite.publishedAt.toISOString()},{randomInt:()=>0,assignedAt:'2026-10-18T00:00:00Z'})
 const slotset={attemptEpoch:1,runtimeGeneration:'UNIFIED_V1',snapshotHash:'slots',slots:[{slotKey:'form-section:section_a',unitType:'FORM_SECTION',sourceDefinitionIdentity:{hash:canonicalHash(mapCompositeSection(sections[0]))}}]}
 const attempt:any={trainingFlowSnapshotEncrypted:null,trainingFlowSnapshotHash:null,trainingFlowPathEncrypted:null,trainingFlowPathHash:null,runtimeGeneration:'UNIFIED_V1',deliveryMode:'FINAL_ONLY',id:'attempt',participantKey:'user:one',attemptEpoch:1,compositeAssessment:composite,trainingVariantAllocationEncrypted:JSON.stringify(allocation),trainingVariantAllocationHash:allocation.allocationHash,frozenActiveSlotSetEncrypted:JSON.stringify(slotset),frozenActiveSlotSetHash:'slots',formSectionAttempts:[{sectionId:'section_a'}]}
 return {attempt,composite,allocation,slotset}
}
describe('Training variant attempt scope',()=>{
 it('projects only selected complete section without mutating the union',async()=>{
  const {attempt,composite}=fixture();const projected=await applyTrainingAttemptScope(attempt)
  expect(projected.compositeAssessment.items.map((i:any)=>i.id)).toEqual(['form_a'])
  expect(projected.compositeAssessment.formSections.map((i:any)=>i.id)).toEqual(['section_a'])
  expect(composite.items).toHaveLength(2);expect(attempt.compositeAssessment).toBe(composite)
  expect(await resolveTrainingAttemptScope(projected)).toBe(projected.trainingVariantScope)
 })
 it('leaves historical null attempts untouched',async()=>{const attempt={trainingFlowSnapshotEncrypted:null,trainingFlowSnapshotHash:null,trainingFlowPathEncrypted:null,trainingFlowPathHash:null,trainingVariantAllocationEncrypted:null,trainingVariantAllocationHash:null,compositeAssessment:{trainingFlowDraft:null,trainingFlowFrozen:null,trainingFlowDigest:null,trainingVariantDraft:null,trainingVariantFrozen:null,trainingVariantDigest:null,items:[{id:'old'}],formSections:[]}};expect(await applyTrainingAttemptScope(attempt)).toBe(attempt)})
 it('passes the operation transaction to selected slot reads',async()=>{vi.mocked(loadFrozenActiveSlotSet).mockClear();const {attempt}=fixture();const db={$queryRaw:vi.fn()};await resolveTrainingAttemptScope(attempt,attempt.compositeAssessment,{db});expect(loadFrozenActiveSlotSet).toHaveBeenCalledWith(attempt.frozenActiveSlotSetEncrypted,db)})
 it('accepts batch preloaded slots without another read',async()=>{vi.mocked(loadFrozenActiveSlotSet).mockClear();const {attempt,slotset}=fixture();await resolveTrainingAttemptScope(attempt,attempt.compositeAssessment,{frozenSlotSets:new Map([[attempt.id,slotset]])});expect(loadFrozenActiveSlotSet).not.toHaveBeenCalled()})
 it.each(['trainingVariantAllocationEncrypted','trainingVariantAllocationHash','frozenActiveSlotSetEncrypted','frozenActiveSlotSetHash'])('fails closed on missing %s',async key=>{const {attempt}=fixture();attempt[key]=null;await expect(resolveTrainingAttemptScope(attempt)).rejects.toThrow()})
 it.each(['trainingVariantFrozen','trainingVariantDigest'])('fails closed on missing publication %s',async key=>{const {attempt,composite}=fixture();composite[key]=null;await expect(resolveTrainingAttemptScope(attempt)).rejects.toThrow()})
 it.each(['id','participantKey','attemptEpoch'])('rejects mismatched attempt %s',async key=>{const {attempt}=fixture();attempt[key]=key==='attemptEpoch'?2:'other';await expect(resolveTrainingAttemptScope(attempt)).rejects.toThrow()})
 it('rejects union section edits rather than renumbering or repairing',async()=>{const {attempt,composite}=fixture();composite.formSections[0].position=4;await expect(resolveTrainingAttemptScope(attempt)).rejects.toThrow()})
 it('rejects missing selected definitions',async()=>{const {attempt,composite}=fixture();composite.items=[];await expect(resolveTrainingAttemptScope(attempt)).rejects.toThrow()})
 it('rejects outside-group slot',async()=>{const {attempt,slotset}=fixture();slotset.slots[0].slotKey='form-section:section_b';attempt.frozenActiveSlotSetEncrypted=JSON.stringify(slotset);await expect(resolveTrainingAttemptScope(attempt)).rejects.toThrow()})
 it('rejects missing selected slot',async()=>{const {attempt,slotset}=fixture();slotset.slots=[];attempt.frozenActiveSlotSetEncrypted=JSON.stringify(slotset);await expect(resolveTrainingAttemptScope(attempt)).rejects.toThrow()})
 it('rejects wrong scientific section identity',async()=>{const {attempt,slotset}=fixture();slotset.slots[0].sourceDefinitionIdentity.hash='wrong';attempt.frozenActiveSlotSetEncrypted=JSON.stringify(slotset);await expect(resolveTrainingAttemptScope(attempt)).rejects.toThrow()})
 it('rejects outside-group children',async()=>{const {attempt}=fixture();attempt.scaleAssessments=[{compositeItemId:'outside'}];await expect(resolveTrainingAttemptScope(attempt)).rejects.toThrow()})
 it('does not accept orphan allocation on legacy publication',async()=>{const {attempt}=fixture();attempt.compositeAssessment={items:[],formSections:[]};await expect(resolveTrainingAttemptScope(attempt)).rejects.toThrow()})
})

it('detects each incomplete marker before a legacy report fast path', async()=>{
  expect(hasTrainingVariantMetadata({compositeAssessment:{}})).toBe(true)
  await expect(resolveTrainingAttemptScope({compositeAssessment:{}})).rejects.toThrow(/标志未加载/)
  for(const field of ['trainingVariantAllocationEncrypted','trainingVariantAllocationHash']){
    const attempt={ [field]:'present',compositeAssessment:{} }
    expect(hasTrainingVariantMetadata(attempt)).toBe(true)
    await expect(resolveTrainingAttemptScope(attempt)).rejects.toThrow()
  }
  for(const field of ['trainingVariantDraft','trainingVariantFrozen','trainingVariantDigest']){
    const attempt={compositeAssessment:{[field]:'present'}}
    expect(hasTrainingVariantMetadata(attempt)).toBe(true)
    await expect(resolveTrainingAttemptScope(attempt)).rejects.toThrow()
  }
})
