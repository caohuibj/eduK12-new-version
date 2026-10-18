import { prisma } from '../../config/database'
import { InstrumentFinalSubmitError } from '../../services/instrumentFinalSubmit'
import { normalizeCompositeSectionAnswers } from '../composite/final-submit.service'
import { canonicalHash, canonicalJsonBytes } from './canonical'
import { readFormSectionCollectionFacts, type FormSectionCollectionFacts } from './form-facts'
import { mapCompositeSection, type CompositeSection } from './form-section-definition'
import { decryptUnifiedRuntimePayload } from './security'
import { formSectionSlotKey } from './slot-set'
import type { TypedFormValue } from './typed-form'

const invalid = (message: string): never => { throw new InstrumentFinalSubmitError('DEFINITION_MISMATCH', message, 409) }

/** Definition-bound V2 validation, used by finalization and all new fact readers.
 * Identity-only V1 checks remain with the historical aggregate path. */
export const assertTypedCompositeFormFacts = (section: CompositeSection, facts: FormSectionCollectionFacts): string | null => {
  const typed = section.items.some(item => item.formDefinition != null)
  if (!typed && facts.schemaVersion === 1) return null
  if (!typed || facts.schemaVersion !== (section.items.some(item=>item.formPolicy!=null)?3:2) || facts.sectionKey !== section.id) invalid('typed Form facts 版本或区段绑定不匹配')
  if (facts.items.length !== section.items.length) invalid('typed Form facts 数量不匹配')
  const byId = new Map(section.items.map(item => [item.id, item]))
  for (const fact of facts.items) if (byId.get(fact.key)?.formLabel !== fact.label) invalid('typed Form facts 题目绑定不匹配')
  let normalized: ReturnType<typeof normalizeCompositeSectionAnswers>
  try { normalized = normalizeCompositeSectionAnswers(section, facts.items.filter(fact => !('state' in fact) || fact.state !== 'NOT_SHOWN').map(fact => {
    let value: TypedFormValue = fact.value
    if ('rowStates' in fact && fact.rowStates) value = { ...(value && typeof value === 'object' ? value : {}), ...Object.fromEntries(Object.entries(fact.rowStates).filter(([,state])=>state==='REFUSED').map(([key])=>[key,{_surveyRefusal:true}])) } as TypedFormValue
    else if ('state' in fact && fact.state === 'REFUSED') value = {_surveyRefusal:true}
    return {formItemId:fact.key,value,...('otherText' in fact && typeof fact.otherText==='string'?{otherText:fact.otherText}: {})}
  })) }
  catch { invalid('typed Form facts 不符合冻结定义') }
  const expected = facts.schemaVersion===3 ? normalized!.normalized.map(entry=>({key:entry.item.id,label:entry.item.formLabel,value:entry.normalizedValue,state:'state' in entry?entry.state:entry.normalizedValue===null?'SHOWN_MISSING':'ANSWERED',...('rowStates' in entry && entry.rowStates?{rowStates:entry.rowStates}:{}),...('otherText' in entry && entry.otherText!==undefined?{otherText:entry.otherText}:{})})) : normalized!.normalized.map(entry => ({ key: entry.item.id, label: entry.item.formLabel, value: entry.normalizedValue }))
  if (!canonicalJsonBytes(expected).equals(canonicalJsonBytes(facts.items))) invalid('typed Form facts 非规范化顺序或数值')
  return normalized!.taskSatisfaction
}

/** Caller must already authorize this parent. Returns authoritative typed facts,
 * never parses or falls back to the mutable legacy String answer projection. */
export const loadCompositeTypedFormValues = async (attempt: {
  id: string; attemptEpoch: number; runtimeGeneration?: string | null;
  compositeAssessment: { id?: string; items: Array<{ formDefinition?: unknown; type: string }>; formSections?: any[] };
}, metadata?: Map<string, {state:string;rowStates?:Record<string,string>;otherText?:string}>): Promise<Map<string, TypedFormValue>> => {
  const result = new Map<string, TypedFormValue>()
  if (!attempt.compositeAssessment.items.some(item => item.type === 'FORM' && item.formDefinition != null)) return result
  if (attempt.runtimeGeneration !== 'UNIFIED_V1') invalid('typed Form 缺少统一运行时事实')
  if (!attempt.compositeAssessment.formSections && !attempt.compositeAssessment.id) invalid('typed Form 缺少父定义身份')
  const rows = attempt.compositeAssessment.formSections ?? await prisma.compositeFormSection.findMany({
    where: { compositeAssessmentId: attempt.compositeAssessment.id }, include: { items: true },
  })
  const sections = rows.map(mapCompositeSection).filter(section => section.items.some(item => item.formDefinition != null))
  const typedIds = attempt.compositeAssessment.items.filter(item => item.type === 'FORM' && item.formDefinition != null)
  if (!sections.length || sections.reduce((n, section) => n + section.items.filter(item => item.formDefinition != null).length, 0) !== typedIds.length) invalid('typed Form 缺少冻结区段')
  const snapshots = await prisma.assessmentUnitSnapshot.findMany({ where: {
    compositeAttemptId: attempt.id, attemptEpoch: attempt.attemptEpoch,
    slotKey: { in: sections.map(section => formSectionSlotKey(section.id)) },
  } })
  for (const section of sections) {
    const found = snapshots.filter(snapshot => snapshot.slotKey === formSectionSlotKey(section.id))
    const row = found[0]
    if (found.length !== 1 || row.terminalState !== 'COMPLETED' || row.payloadKind !== 'COLLECTION_FACTS' || row.unitType !== 'FORM_SECTION' || row.sourceType !== 'COMPOSITE_FORM_SECTION' || row.sourceDefinitionHash !== canonicalHash(section) || !row.collectionFactsEncrypted) invalid('typed Form 权威快照缺失或冻结绑定不匹配')
    const facts = readFormSectionCollectionFacts(decryptUnifiedRuntimePayload<unknown>(row.collectionFactsEncrypted!))
    assertTypedCompositeFormFacts(section, facts)
    // Every value in a V2 section, including legacy-compatible text fields,
    // comes from the same accepted snapshot.
    for (const fact of facts.items) {
      result.set(fact.key, fact.value)
      if(facts.schemaVersion===3 && "state" in fact) metadata?.set(fact.key,{state:fact.state as string,...("rowStates" in fact && fact.rowStates?{rowStates:fact.rowStates as Record<string,string>}:{}),...("otherText" in fact && typeof fact.otherText==="string"?{otherText:fact.otherText}:{})})
    }
  }
  return result
}
