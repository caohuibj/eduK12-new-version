import { typedCompositeFormQuestion, type TypedFormValue } from '../assessment-runtime/typed-form'
import type { CompositeSectionItem } from '../assessment-runtime/form-section-definition'
/** Minimal frozen display metadata, never a second scoring/normalization model. */
export const typedFormPresentation = (item:CompositeSectionItem,value:TypedFormValue) => {
  const question=typedCompositeFormQuestion(item)
  return {typedValue:value,presentation:{type:question.type,
    options:question.options.map(option=>({key:option.optionKey,label:option.label})),
    rows:question.rows.map(row=>({key:row.rowKey,label:row.label}))}}
}
