/** Training adapter for the shared Form definition and answer contracts.
 * The database ID addresses a module; itemKey belongs to its immutable definition.
 * Advanced authoring and V3 display/refusal policy are enabled in later units.
 */
import { validateFormDefinition, type FormQuestion } from '../assessment-core/form/definition'
import { normalizeFormAnswers } from '../assessment-core/form/runtime'
import { parseAnswerMap, FormAnswerValidationError } from '../assessment-core/form/answers'
import { InstrumentFinalSubmitError } from '../../services/instrumentFinalSubmit'
import { canonicalJsonBytes } from './canonical'
import type { CompositeSectionItem } from './form-section-definition'

export type TypedFormValue = string | number | string[] | Record<string, string | number | string[]> | null
const legacyTypes: Record<string, string> = { single_choice: 'SINGLE', multiple_choice: 'MULTIPLE', fill_blank: 'SHORT_TEXT', text_input: 'SHORT_TEXT', number: 'NUMBER', long_text: 'LONG_TEXT', date: 'DATE', time: 'TIME', likert: 'LIKERT', matrix: 'MATRIX', matrix_multiple: 'MATRIX_MULTIPLE', rank_order: 'RANK_ORDER', slider: 'SLIDER', constant_sum: 'CONSTANT_SUM' }
const invalid = (message: string): never => { throw new InstrumentFinalSubmitError('FORM_ANSWER_INVALID', message, 400) }

export const typedCompositeFormQuestion = (item: CompositeSectionItem): FormQuestion => {
  const checked = validateFormDefinition({ schemaVersion: 2, pages: [{ pageKey: 'training', title: 'Training', questions: [item.formDefinition] }] })
  if (!checked.definition || checked.issues.some(issue => issue.severity === 'error')) invalid('表单定义无效：' + checked.issues.map(issue => issue.message).join('; '))
  const question = checked.definition!.pages[0].questions[0]
  if (question.type !== (legacyTypes[item.formType] ?? item.formType) || question.required !== item.required || question.prompt !== item.formLabel) invalid('表单定义与字段类型、标题或必答策略不匹配')
  // C06 owns these policies; do not silently inherit Survey V2 semantics.
  if (question.displayIf || question.allowRefusal || question.otherOptionKey || question.exclusiveOptionKeys?.length) invalid('此 Training 版本尚未开放显隐、拒答或其他/互斥策略')
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
  const questions = items.filter(item => item.formDefinition != null).map(typedCompositeFormQuestion)
  if (!questions.length) return
  const pages = Array.from({ length: Math.ceil(questions.length / 80) }, (_, index) => ({
    pageKey: 'page_' + index, title: 'Training', questions: questions.slice(index * 80, (index + 1) * 80),
  }))
  const checked = validateFormDefinition({ schemaVersion: 2, pages })
  if (!checked.definition || checked.issues.some(issue => issue.severity === 'error')) invalid('表单区段定义无效：' + checked.issues.map(issue => issue.message).join('; '))
}
