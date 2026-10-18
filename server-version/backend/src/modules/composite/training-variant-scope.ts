import type { SharedControlDb } from '../assessment-runtime/shared-control-records'
import { trainingVariantMarkerState } from './training-variant-markers'
import { canonicalHash } from '../assessment-runtime/canonical'
import { decryptUnifiedRuntimePayload } from '../assessment-runtime/security'
import { loadFrozenActiveSlotSet, compositeItemSlotKey, formSectionSlotKey } from '../assessment-runtime/slot-set'
import { compositeFormSectionDefinitionHash, mapCompositeSection } from '../assessment-runtime/form-section-definition'
import { parseCompiledWeightedVariants, validateWeightedVariantAllocation, type WeightedVariantUnion } from '../assessment-core/weighted-variants'
import { compositeForbidden } from './composite.errors'

/** Publication identity retains original IDs and positions. Projection never renumbers definitions. */
export function buildTrainingVariantUnion(composite: any): WeightedVariantUnion {
  const items = composite.items ?? []
  const stableKeys = new Map<string,string>(items.filter((i:any)=>i.formDefinition?.itemKey).map((i:any)=>[i.formDefinition.itemKey,i.id]))
  const units = [
    ...items.filter((i:any)=>i.type!=='FORM').map((i:any)=>({ type:'ITEM' as const,id:i.id,position:i.position,
      definitionHash:canonicalHash({id:i.id,type:i.type,position:i.position,required:i.required!==false,
        scaleId:i.scaleId??null,cognitiveAssignmentId:i.cognitiveAssignmentId??null,
        situationalInstrumentKey:i.situationalInstrumentKey??null,situationalInstrumentVersion:i.situationalInstrumentVersion??null})})),
    ...(composite.formSections??[]).map((s:any)=>{
      const definition=mapCompositeSection(s)
      return {type:'FORM_SECTION' as const,id:s.id,position:s.position,
        definitionHash:compositeFormSectionDefinitionHash(definition),contextSection:definition.contextSection,
        itemIds:definition.items.map(i=>i.id),conditionReferences:(s.items??[]).filter((i:any)=>i.formDefinition?.displayIf)
          .map((i:any)=>({itemId:i.id,sourceItemId:stableKeys.get(i.formDefinition.displayIf.itemKey)??'__missing_reference__'}))}
    }),
  ].sort((a,b)=>a.position-b.position||a.id.localeCompare(b.id)).map(({position,...unit})=>unit)
  return {units}
}
/** Detect every marker, including incomplete metadata, before any legacy fast path. */
export const hasTrainingVariantMetadata = (attempt:any, composite:any=attempt.compositeAssessment):boolean =>
  trainingVariantMarkerState(attempt,composite) !== 'LEGACY'

export type TrainingAttemptScope = {
  items:any[];formSections:any[];itemIds:Set<string>;sectionIds:Set<string>;variant:any|null
}
const scopes=new WeakMap<object,TrainingAttemptScope>()
const verifiedDefinitions=new WeakMap<object,ReturnType<typeof parseCompiledWeightedVariants>>()
export type TrainingAttemptScopeOptions = { db?: SharedControlDb; frozenSlotSets?: Map<string, Awaited<ReturnType<typeof loadFrozenActiveSlotSet>>> }
export async function resolveTrainingAttemptScope(attempt:any,composite:any=attempt.compositeAssessment,options?:TrainingAttemptScopeOptions):Promise<TrainingAttemptScope>{
  const known=scopes.get(attempt)
  if(known)return known
  if(!composite)throw compositeForbidden('作答缺少冻结问卷来源')
  if(trainingVariantMarkerState(attempt,composite)==='UNKNOWN')throw compositeForbidden('概率分卷来源标志未加载，不能推断旧模式')
  const configured=composite.trainingVariantFrozen!=null||composite.trainingVariantDigest!=null
  if(!configured){
    if(attempt.trainingVariantAllocationEncrypted!=null||attempt.trainingVariantAllocationHash!=null||composite.trainingVariantDraft!=null)
      throw compositeForbidden('概率分卷冻结来源不完整')
    return {items:composite.items??[],formSections:composite.formSections??[],itemIds:new Set((composite.items??[]).map((i:any)=>i.id)),sectionIds:new Set((composite.formSections??[]).map((s:any)=>s.id)),variant:null}
  }
  try{
    if(attempt.runtimeGeneration !== 'UNIFIED_V1' || attempt.deliveryMode !== 'FINAL_ONLY')throw new Error('unsupported variant runtime')
    if(!attempt.trainingVariantAllocationEncrypted||!attempt.trainingVariantAllocationHash||!composite.trainingVariantFrozen||!composite.trainingVariantDigest)
      throw new Error('missing allocation')
    let config=verifiedDefinitions.get(composite)
    if(!config){
      config=parseCompiledWeightedVariants(composite.trainingVariantFrozen)
      if(config.configDigest!==composite.trainingVariantDigest)throw new Error('configuration digest mismatch')
      const union=buildTrainingVariantUnion(composite)
      if(canonicalHash({kind:'WEIGHTED_VARIANT_UNION',schemaVersion:1,units:union.units})!==config.unionDigest)throw new Error('publication union mismatch')
      verifiedDefinitions.set(composite,config)
    }
    const allocation=validateWeightedVariantAllocation(decryptUnifiedRuntimePayload(attempt.trainingVariantAllocationEncrypted),config,{
      compositeId:composite.id,attemptId:attempt.id,participantKey:attempt.participantKey,attemptEpoch:attempt.attemptEpoch,
      publishedAt:new Date(composite.publishedAt).toISOString(),
    })
    if(allocation.allocationHash!==attempt.trainingVariantAllocationHash)throw new Error('allocation hash mismatch')
    if(!attempt.frozenActiveSlotSetEncrypted||!attempt.frozenActiveSlotSetHash)throw new Error('missing selected slots')
    const slots=options?.frozenSlotSets?.get(attempt.id) ?? await loadFrozenActiveSlotSet(attempt.frozenActiveSlotSetEncrypted, options?.db)
    if(slots.snapshotHash!==attempt.frozenActiveSlotSetHash||slots.attemptEpoch!==attempt.attemptEpoch)throw new Error('selected slot identity mismatch')
    const itemIds=new Set<string>(allocation.selectedItemIds),sectionIds=new Set<string>(allocation.selectedSectionIds)
    const items=(composite.items??[]).filter((i:any)=>itemIds.has(i.id)),formSections=(composite.formSections??[]).filter((s:any)=>sectionIds.has(s.id))
    if(items.length!==itemIds.size||formSections.length!==sectionIds.size)throw new Error('selected definition missing')
    const expected=new Set<string>([...items.filter((i:any)=>i.type!=='FORM'&&i.required!==false).map((i:any)=>compositeItemSlotKey(i.id,i.type)),...formSections.map((s:any)=>formSectionSlotKey(s.id))])
    if(expected.size!==slots.slots.length||slots.slots.some((s:any)=>!expected.has(s.slotKey)))throw new Error('allocation/slot membership mismatch')
    for(const section of formSections){
      if((section.items??[]).some((i:any)=>!itemIds.has(i.id)))throw new Error('partial Form section')
      const slot=slots.slots.find((s:any)=>s.slotKey===formSectionSlotKey(section.id))
      if(slot?.unitType!=='FORM_SECTION'||slot.sourceDefinitionIdentity.hash!==canonicalHash(mapCompositeSection(section)))throw new Error('selected section identity mismatch')
    }
    for(const key of ['scaleAssessments','cognitiveSessions','situationalAttempts'])if((attempt[key]??[]).some((child:any)=>!itemIds.has(child.compositeItemId)))throw new Error('unselected child exists')
    if((attempt.formSectionAttempts??[]).some((child:any)=>!sectionIds.has(child.sectionId)))throw new Error('unselected section child exists')
    const result={items,formSections,itemIds,sectionIds,variant:allocation};scopes.set(attempt,result);return result
  }catch(error){throw compositeForbidden('概率分卷作答的冻结配置、分配或单元不一致')}
}
/** Returns a shallow projection; never mutates the loaded union graph. */
export async function applyTrainingAttemptScope(attempt:any,options?:TrainingAttemptScopeOptions):Promise<any>{
  const scope=await resolveTrainingAttemptScope(attempt,attempt.compositeAssessment,options)
  if(!scope.variant)return attempt
  const projected={...attempt,compositeAssessment:{...attempt.compositeAssessment,items:scope.items,formSections:scope.formSections},trainingVariantScope:scope}
  scopes.set(projected,scope)
  return projected
}
