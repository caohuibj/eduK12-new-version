import {readInstance} from '../bundle-product/instance'
import {compositeConflict} from '../composite/composite.errors'
import type { FormQuestion } from '../assessment-core/form/definition'
import { canonicalHash } from '../assessment-runtime/canonical'
import { mapCompositeSection } from '../assessment-runtime/form-section-definition'
import { typedCompositeFormQuestion } from '../assessment-runtime/typed-form'
import { groupFormMetricType, type GroupMetricDefinition, type GroupMetricObservation } from '../reporting/group-summary'
import type { FrozenReportSnapshot } from '../cognitive/profile-freeze'
import type { CognitiveResultSnapshot } from '../cognitive/v2/types'

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

export const trainingCognitiveGroupTaskKey = (assignmentId:string) => `cognitive-assignment:${assignmentId}`
export const trainingCognitiveGroupAssignmentId = (taskId:string) => taskId.startsWith('cognitive-assignment:') ? taskId.slice('cognitive-assignment:'.length) : null
export interface TrainingStandaloneCognitiveSession {
  id:string;userId:string|null;participantKey:string;attemptNo:number;status:string;finishedAt:Date|string
  result:CognitiveResultSnapshot|null
}

/** Adapt already persisted professional-report values, never trials or live
 * registry scores. Select the latest completed session before metric visibility. */
export function selectLatestTrainingCognitiveSessions<T extends {id:string;userId:string|null;participantKey:string;status:string;finishedAt:Date|string|null}>(assignmentId:string,sessions:T[]) {
  return selectLatestTrainingGroupParents(sessions.map(row=>({...row,completedAt:row.finishedAt})),
    new Map(sessions.map(row=>[row.id,{participantKey:row.userId?`user:${row.userId}`:`assignment:${assignmentId}:${row.participantKey}`}])) )
}

export function trainingStandaloneCognitiveFacts(input:{assignmentId:string;resolvedConfigHash:string;report:FrozenReportSnapshot;sessions:TrainingStandaloneCognitiveSession[]}) {
  const selected=selectLatestTrainingCognitiveSessions(input.assignmentId,input.sessions)
  const first=selected.find(row=>row.result)?.result
  if(!first)return null
  const identity=(result:CognitiveResultSnapshot)=>({testType:result.testType,configVersion:result.configVersion,engineVersion:result.engineVersion,scoringVersion:result.scoringVersion,protocolSignature:result.protocolSignature,profile:result.profile})
  const measurement=identity(first)
  if(selected.some(row=>row.result&&(row.result.profile!==input.report.profile||canonicalHash(identity(row.result))!==canonicalHash(measurement))))throw compositeConflict('独立认知任务的冻结协议或 Profile 不一致，不能混合统计')
  const metrics=input.report.v2MetricDefinitions??input.report.metricDefinitions
  const definitions:GroupMetricDefinition[]=Object.entries(metrics).filter(([key,metric])=>['number','integer'].includes(metric.valueType)&&metric.role!=='research_only'&&!['hidden','research_only'].includes((metric as {visibility?:string}).visibility??'')&&metric.availableProfiles.includes('standard')&&metric.availableProfiles.includes(input.report.profile)&&key!=='productIndex'&&key!=='product_index').map(([key,metric])=>({key,label:metric.label,type:'NUMBER',unit:metric.unit,range:null,measurement:{...measurement,resolvedConfigHash:input.resolvedConfigHash,metricDefinitionVersion:input.report.metricDefinitionVersion,scoreKey:key,unit:metric.unit}}))
  const observations:GroupMetricObservation[]=[]
  for(const session of selected){
    const report=session.result?.report
    if(report&&![report.headline,report.user,report.detail].every(Array.isArray))throw compositeConflict('认知冻结专业报告不可读')
    const visible=new Map((report?[...(report.headline as Array<{key:string;value:unknown;unit:string}>),...(report.user as Array<{key:string;value:unknown;unit:string}>),...(report.detail as Array<{key:string;value:unknown;unit:string}>)]:[]).map(metric=>[metric.key,metric]))
    for(const definition of definitions){
      const view=visible.get(definition.key),value=view?.value,numeric=typeof value==='number'&&Number.isFinite(value)
      if(numeric&&(value!==session.result?.metrics[definition.key]||view?.unit!==definition.unit))throw compositeConflict('认知冻结报告与已保存指标或单位不一致')
      observations.push({parentId:session.id,metricKey:definition.key,value:numeric?value:null,missingReason:numeric?null:session.result?'NOT_CALCULABLE':'MISSING_SOURCE',quality:session.result?.quality.state??null})
    }
  }
  return {selected,definitions,observations,measurement,configDigest:canonicalHash({measurement,resolvedConfigHash:input.resolvedConfigHash,metricDefinitionVersion:input.report.metricDefinitionVersion})}
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
