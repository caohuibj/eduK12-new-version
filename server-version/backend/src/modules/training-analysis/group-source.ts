import {readInstance} from '../bundle-product/instance'
import {compositeConflict} from '../composite/composite.errors'
import type { FormQuestion } from '../assessment-core/form/definition'
import { canonicalHash } from '../assessment-runtime/canonical'
import { mapCompositeSection } from '../assessment-runtime/form-section-definition'
import { typedCompositeFormQuestion } from '../assessment-runtime/typed-form'
import { groupFormMetricType, type GroupMetricDefinition, type GroupMetricObservation } from '../reporting/group-summary'

export interface TrainingGroupSource {
  parents: Array<{attemptId: string; attemptEpoch: number; stableIdentity: string | null}>
  definitions: GroupMetricDefinition[]
  observations: GroupMetricObservation[]
  snapshots: Array<{attemptId: string; attemptEpoch: number; slotKey: string; hash: string}>
}

/** Select the completed parent before looking at its variant or leaf values.
 * Anonymous unlinked responses remain responses, never invented people. */
export function selectLatestTrainingGroupParents<T extends {id: string; status: string; completedAt?: Date | string | null}>(
  attempts: T[], identities: ReadonlyMap<string, {participantKey: string}>,
): T[] {
  const selected = new Map<string, T>()
  for (const row of attempts) {
    if (row.status !== 'COMPLETED') continue
    const key = identities.get(row.id)?.participantKey ?? `response:${row.id}`, previous = selected.get(key)
    const order = `${new Date(row.completedAt!).toISOString()}:${row.id}`
    if (!previous || order > `${new Date(previous.completedAt!).toISOString()}:${previous.id}`) selected.set(key, row)
  }
  return [...selected.values()]
}

/** The existing frozen typed Form parser owns definition/answer semantics. */
export function trainingGroupFormDefinitions(item: any): GroupMetricDefinition[] {
  const question = trainingGroupFormQuestion(item)
  const type = groupFormMetricType(question.type)
  if (!type) return []
  const options = type === 'NUMBER' ? {} : {options: question.options.map(option => ({value: option.optionKey, label: option.label}))}
  const range = typeof question.min === 'number' && typeof question.max === 'number' ? {min: question.min, max: question.max} : null
  const definitions = question.type === 'MATRIX' || question.type === 'MATRIX_MULTIPLE'
    ? question.rows.map(row => ({key: `${question.itemKey}:${row.rowKey}`, label: `${question.prompt} · ${row.label}`}))
    : [{key: question.itemKey, label: question.prompt}]
  return definitions.map(definition => ({...definition, type, unit: null, range, measurement: {definition: canonicalHash(item.formDefinition)}, ...options}))
}

export function trainingGroupFormQuestion(item: any): FormQuestion {
  if (item.formDefinition) return typedCompositeFormQuestion(mapCompositeSection({id: item.formSectionId, title: '', position: 0, items: [item]}).items[0])
  return {itemKey: item.id, type: item.formType === 'single_choice' ? 'SINGLE' : item.formType === 'multiple_choice' ? 'MULTIPLE' : 'LONG_TEXT', prompt: item.formLabel, required: item.required,
    options: (item.formOptions ?? []).map((option: {value: string; label: string}) => ({optionKey: option.value, label: option.label})), rows: []}
}


/** Native Bundle measurement bindings only. Context Forms and Profile output
 * remain part of administration, never become group-report leaf metrics. */
export function trainingGroupLeafItems<T extends {id:string;type:string}>(task:{productKind?:string;items:T[];bundleInstance?:Parameters<typeof readInstance>[0]|null}):T[]{
  if(task.productKind!=='ASSESSMENT_BUNDLE')return task.items
  if(!task.bundleInstance)throw compositeConflict('固定 Bundle 缺少冻结来源')
  const {frozen,bindings}=readInstance(task.bundleInstance)
  const ids=new Set<string>()
  for(const binding of bindings.slots){
    const slot=frozen.bundleSnapshot.slotBindings.find(slot=>slot.slotKey===binding.slotKey)
    const item=task.items.find(item=>item.id===binding.itemId)
    if(!slot||!['SCALE','COGNITIVE','SITUATIONAL'].includes(slot.unitType)||slot.unitType!==binding.unitType||item?.type!==binding.unitType||ids.has(binding.itemId))
      throw compositeConflict('固定 Bundle 叶工具与冻结来源不一致')
    ids.add(binding.itemId)
  }
  return task.items.filter(item=>ids.has(item.id))
}
