import {publicMaterial} from '../assessment-media/material'
/** Training adapter for the shared Form definition and answer contracts.
 * The database ID addresses a module; itemKey belongs to its immutable definition.
 * Advanced authoring and V3 display/refusal policy are enabled in later units.
 */
import { formQuestionSchema, validateFormDefinition, type FormQuestion } from '../assessment-core/form/definition'
import { normalizeFormAnswers } from '../assessment-core/form/runtime'
import { parseAnswerMap, FormAnswerValidationError } from '../assessment-core/form/answers'
import { InstrumentFinalSubmitError } from '../../services/instrumentFinalSubmit'
import { canonicalJsonBytes } from './canonical'
import { orderedCompositeFormSectionItems, type CompositeSectionItem } from './form-section-definition'
import { readTrainingFormPolicy, type FormFactState } from './form-policy'
import { isRefusal, type ExplicitFormRefusal } from '../assessment-core/form/answers'

export type TypedFormValue = string | number | string[] | Record<string, string | number | string[] | ExplicitFormRefusal> | ExplicitFormRefusal | null
const legacyTypes: Record<string, string> = { single_choice: 'SINGLE', multiple_choice: 'MULTIPLE', fill_blank: 'SHORT_TEXT', text_input: 'SHORT_TEXT', number: 'NUMBER', long_text: 'LONG_TEXT', date: 'DATE', time: 'TIME', likert: 'LIKERT', matrix: 'MATRIX', matrix_multiple: 'MATRIX_MULTIPLE', rank_order: 'RANK_ORDER', slider: 'SLIDER', constant_sum: 'CONSTANT_SUM' }
const invalid = (message: string): never => { throw new InstrumentFinalSubmitError('FORM_ANSWER_INVALID', message, 400) }

export const typedCompositeFormQuestion = (item: CompositeSectionItem): FormQuestion => {
  const parsed = formQuestionSchema.safeParse(item.formDefinition)
  if (!parsed.success) invalid('表单定义无效')
  const policy = readTrainingFormPolicy(item.formPolicy)
  // A single-question structural check cannot validate a preceding reference.
  // The unchanged shared validator checks the complete ordered graph at publication/FINAL.
  const checked = validateFormDefinition({ schemaVersion: 2, pages: [{ pageKey: 'training', title: 'Training', questions: [{ ...parsed.data!, displayIf: undefined }] }] }, { forPreview: true })
  if (!checked.definition || checked.issues.some(issue => issue.severity === 'error')) invalid('表单定义无效：' + checked.issues.map(issue => issue.message).join('; '))
  // The structural preview above deliberately supplies displayIf: undefined.
  // Do not retain that enumerable sentinel in the executable definition: the
  // shared canonical JSON/hash contract correctly rejects undefined values.
  const {displayIf:_previewDisplayIf,...validatedQuestion}=checked.definition!.pages[0].questions[0]
  const question = { ...validatedQuestion, ...(parsed.data!.displayIf ? { displayIf: parsed.data!.displayIf } : {}) }
  if (question.type !== (legacyTypes[item.formType] ?? item.formType) || question.required !== item.required || question.prompt !== item.formLabel) invalid('表单定义与字段类型、标题或必答策略不匹配')
  // C06 owns these policies; do not silently inherit Survey V2 semantics.
  if (!policy && (question.displayIf || question.allowRefusal || question.otherOptionKey || question.exclusiveOptionKeys?.length)) invalid('此 Training 版本尚未开放显隐、拒答或其他/互斥策略')
  if ([question.itemKey,...question.rows.map(row=>row.rowKey),...question.options.map(option=>option.optionKey)].some(key=>['__proto__','constructor','prototype'].includes(key))) invalid('表单包含不允许的保留键')
  if (question.image) invalid('此 Training 版本尚未开放 typed Form 图片')
  if (item.formType === 'single_choice' || item.formType === 'multiple_choice') {
    const options = Array.isArray(item.formOptions) ? item.formOptions : []
    if (canonicalJsonBytes(options.map(option => ({ optionKey: option.value, label: option.label }))).compare(canonicalJsonBytes(question.options.map(option => ({ optionKey: option.optionKey, label: option.label })))) !== 0) invalid('公共定义与兼容选项不匹配')
  }
  if (item.contextKey) invalid('人口学字段暂不支持 typed Form 定义')
  return question
}

export const normalizeTypedCompositeFormAnswer = (item: CompositeSectionItem, value: unknown): TypedFormValue => {
  const question = typedCompositeFormQuestion(item)
  const answers: Record<string, unknown> = {}
  if (question.type === 'MATRIX' || question.type === 'MATRIX_MULTIPLE') {
    if (value != null && (typeof value !== 'object' || Array.isArray(value))) invalid('矩阵回答必须是行到答案的对象')
    const rows = value == null ? {} : value as Record<string, unknown>
    for (const [key, answer] of Object.entries(rows)) answers[question.itemKey + ':' + key] = answer
  } else answers[question.itemKey] = value
  try {
    const normalized = normalizeFormAnswers({ schemaVersion: 2, pages: [{ pageKey: 'training', title: 'Training', questions: [question] }] }, parseAnswerMap(answers, 'answers'))
    return value == null ? null : (normalized.rawAnswers[question.itemKey] as TypedFormValue ?? null)
  } catch (error) {
    if (error instanceof FormAnswerValidationError) invalid(error.message)
    throw error
  }
}

/** Compatibility display/storage only. Never feed this projection back into facts. */
export const legacyFormValueProjection = (value: TypedFormValue): string | null =>
  value === null ? null : typeof value === 'string' ? value : canonicalJsonBytes(value).toString('utf8')

/** Validate the section budget and stable-key namespace before freezing it. */
export const validateTypedCompositeSectionDefinition = (items: CompositeSectionItem[]): void => {
  const questions = orderedCompositeFormSectionItems(items).filter(item => item.formDefinition != null).map(typedCompositeFormQuestion)
  const previous = new Map<string, FormQuestion>()
  for (const question of questions) {
    if (question.displayIf && !['SINGLE', 'MULTIPLE'].includes(previous.get(question.displayIf.itemKey)?.type ?? '')) invalid('Training 条件只能引用同一表单区段的前置单选或多选题')
    previous.set(question.itemKey, question)
  }
  if (!questions.length) return
  const pages = Array.from({ length: Math.ceil(questions.length / 80) }, (_, index) => ({
    pageKey: 'page_' + index, title: 'Training', questions: questions.slice(index * 80, (index + 1) * 80),
  }))
  const checked = validateFormDefinition({ schemaVersion: 2, pages }, { forPreview: true })
  if (!checked.definition || checked.issues.some(issue => issue.severity === 'error')) invalid('表单区段定义无效：' + checked.issues.map(issue => issue.message).join('; '))
}

/** One public normalizer invocation for the entire frozen section. Omission is
 * preserved, including explicit null, so hidden answer injection cannot hide. */
export const normalizeTypedCompositeSection = (items: CompositeSectionItem[], provided: Map<string, {value: TypedFormValue; otherText?: string}>) => {
  const typed = orderedCompositeFormSectionItems(items).filter(item => item.formDefinition != null)
  const questions = typed.map(typedCompositeFormQuestion)
  const answers: Record<string, unknown> = Object.create(null)
  for (let i = 0; i < typed.length; i++) {
    const item = typed[i], q = questions[i], entry = provided.get(item.id)
    if (!entry) continue
    if (q.type === 'MATRIX' || q.type === 'MATRIX_MULTIPLE') {
      if (entry.value !== null && (typeof entry.value !== 'object' || Array.isArray(entry.value) || isRefusal(entry.value))) invalid('矩阵回答必须是行到答案的对象')
      if (entry.value === null) answers[q.itemKey] = null
      else for (const [row, value] of Object.entries(entry.value)) {
        if (['__proto__', 'constructor', 'prototype'].includes(row)) invalid('不允许的矩阵行键')
        answers[q.itemKey + ':' + row] = value
      }
    } else answers[q.itemKey] = entry.value
    if (Object.prototype.hasOwnProperty.call(entry, 'otherText')) answers[q.itemKey + ':other'] = entry.otherText
  }
  // Public matrix normalization represents optional blank as omitted rows; a
  // visible null legacy input is accepted, but a hidden null is still rejected.
  const preceding: Record<string, unknown> = Object.create(null)
  for (const q of questions) {
    const source = q.displayIf && preceding[q.displayIf.itemKey]
    const visible = !q.displayIf || (q.displayIf.operator === 'INCLUDES' ? Array.isArray(source) && source.includes(q.displayIf.optionKey) : source === q.displayIf.optionKey)
    if (visible && (q.type === 'MATRIX' || q.type === 'MATRIX_MULTIPLE') && answers[q.itemKey] === null) delete answers[q.itemKey]
    if (visible) preceding[q.itemKey] = answers[q.itemKey]
  }
  let result: ReturnType<typeof normalizeFormAnswers>
  try { result = normalizeFormAnswers({schemaVersion:2, pages:Array.from({length:Math.ceil(questions.length/80)}, (_,i)=>({pageKey:'p_'+i,title:'Training',questions:questions.slice(i*80,(i+1)*80)}))}, parseAnswerMap(answers,'answers')) }
  catch (error) { if (error instanceof FormAnswerValidationError) invalid(error.message); throw error }
  const missing = new Map(result.missing.map(value => [value.itemKey, value.reason]))
  return new Map(typed.map((item, i) => {
    const q = questions[i], policy = readTrainingFormPolicy(item.formPolicy)
    const rowStates = q.rows.length ? Object.fromEntries(q.rows.map(row => [row.rowKey, missing.get(q.itemKey+':'+row.rowKey) ?? (missing.get(q.itemKey)==='NOT_SHOWN'?'NOT_SHOWN':'ANSWERED')])) as Record<string,FormFactState> : undefined
    const state = (missing.get(q.itemKey) ?? (rowStates && Object.values(rowStates).every(s=>s!=='ANSWERED') ? Object.values(rowStates).includes('REFUSED')?'REFUSED':'SHOWN_MISSING' : 'ANSWERED')) as FormFactState
    const refused = state === 'REFUSED' || Object.values(rowStates ?? {}).includes('REFUSED')
    if (item.required && refused && policy?.requiredRefusal !== 'ALLOW_SUBMIT') invalid('此必答题的明确拒答策略不允许交卷')
    const value = (result.rawAnswers[q.itemKey] ?? null) as TypedFormValue
    const otherText = result.rawAnswers[q.itemKey+':other'] as string | undefined
    const qualifies = !item.required || (!refused && (state !== 'NOT_SHOWN' || policy?.hiddenRequired !== 'NOT_SATISFIED'))
    const payloadValue = rowStates ? Object.fromEntries(q.rows.flatMap(row => rowStates[row.rowKey] === 'REFUSED' ? [[row.rowKey, {_surveyRefusal:true}]] : value && typeof value === 'object' && Object.prototype.hasOwnProperty.call(value,row.rowKey) ? [[row.rowKey,(value as Record<string,unknown>)[row.rowKey]]] : [])) as TypedFormValue : state === 'REFUSED' ? {_surveyRefusal:true} as const : value
    return [item.id, { normalizedValue:value, storedValue:state==='ANSWERED'?legacyFormValueProjection(value):null, completed:state==='ANSWERED', state, ...(rowStates ? {rowStates}:{}), ...(otherText!==undefined?{otherText}:{}), qualifies, payloadValue }]
  }))
}

/** Author rights remain in the frozen definition; participant payloads omit them. */
export function publicTrainingFormDefinition(value:unknown){
  if(!value||typeof value!=='object')return value
  const definition=value as FormQuestion
  return {...definition,...(definition.materials?{materials:definition.materials.map(publicMaterial)}:{})}
}
