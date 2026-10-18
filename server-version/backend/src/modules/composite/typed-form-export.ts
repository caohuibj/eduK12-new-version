import { canonicalHash, canonicalJsonString } from '../assessment-runtime/canonical'
import { typedCompositeFormQuestion, type TypedFormValue } from '../assessment-runtime/typed-form'
import type { TypedFormMetadata } from '../assessment-runtime/typed-form-facts'
import type { CompositeSectionItem } from '../assessment-runtime/form-section-definition'
import type { CompositeExportField } from './composite-export.service'

export const TYPED_FORM_EXPORT_VERSION = 'training-form-export-v1'
export interface TypedFormColumnSource {
  exportVersion: typeof TYPED_FORM_EXPORT_VERSION
  itemId: string; itemKey: string; questionType: string; definitionHash: string
  factsSchemaVersion: 2 | 3; encoding: 'TEXT'|'JSON_STRING'|'NUMBER'|'JSON_STRING_ARRAY'|'JSON_OBJECT'|'STATE'
  sectionKey?:string; sectionDefinitionHash?:string
  rowKey?:string; optionKey?:string
  options:Array<{optionKey:string;label:string}>
  rows:Array<{rowKey:string;label:string}>
  formulaGuard:'EXCEL_APOSTROPHE_PREFIX'
}
export type TypedFormExportColumn = {field:CompositeExportField; read:(value:TypedFormValue,state?:TypedFormMetadata)=>unknown}
const missing = '空值不是0或拒答；状态列为空表示旧V2未记录状态（NOT_RECORDED），V3仅使用持久化四态。JSON_STRING自由文本经JSON.parse无歧义还原；其他TEXT公式前缀以单引号保护且不可无条件逆变换。JSON按明确编码解析。'
const states = ['ANSWERED','REFUSED','SHOWN_MISSING','NOT_SHOWN']
export const typedFormExportColumns = (item:CompositeSectionItem, index:number, detail:'summary'|'full', sectionSource?:Pick<TypedFormColumnSource,'factsSchemaVersion'|'sectionKey'|'sectionDefinitionHash'>):TypedFormExportColumn[] => {
  const q = typedCompositeFormQuestion(item)
  if(detail==='summary' && ['SHORT_TEXT','LONG_TEXT'].includes(q.type)) return []
  const prefix = `F${String(index+1).padStart(3,'0')}`
  const base = {exportVersion:TYPED_FORM_EXPORT_VERSION as typeof TYPED_FORM_EXPORT_VERSION,itemId:item.id,itemKey:q.itemKey,questionType:q.type,
    definitionHash:canonicalHash({definition:item.formDefinition,policy:item.formPolicy??null}),factsSchemaVersion:(item.formPolicy!=null?3:2) as 2|3,
    options:q.options.map(o=>({optionKey:o.optionKey,label:o.label})),rows:q.rows.map(r=>({rowKey:r.rowKey,label:r.label})),formulaGuard:'EXCEL_APOSTROPHE_PREFIX' as const,...sectionSource}
  const columns:TypedFormExportColumn[]=[]
  const add=(suffix:string,label:string,type:'numeric'|'string',encoding:TypedFormColumnSource['encoding'],read:TypedFormExportColumn['read'],source:Partial<TypedFormColumnSource>={})=>{
    columns.push({field:{name:`${prefix}_${suffix}`,label:`[表单] ${q.prompt}${label}`,type,
      missingMeaning:missing,...(encoding==='STATE'?{allowedValues:states}:{}),formSource:{...base,encoding,...source}},read})
  }
  const structured=['MULTIPLE','RANK_ORDER','MATRIX','MATRIX_MULTIPLE','CONSTANT_SUM'].includes(q.type)
  const numeric=['NUMBER','SLIDER'].includes(q.type)
  const freeText=['SHORT_TEXT','LONG_TEXT'].includes(q.type)
  add('value','',numeric?'numeric':'string',numeric?'NUMBER':freeText?'JSON_STRING':structured?(['MULTIPLE','RANK_ORDER'].includes(q.type)?'JSON_STRING_ARRAY':'JSON_OBJECT'):'TEXT',
    value=>value===null?null:structured||freeText?canonicalJsonString(value):value)
  add('state',' 作答状态','string','STATE',(_value,state)=>state?.state??null)
  const object=(value:TypedFormValue)=>value!==null && typeof value==='object' && !Array.isArray(value)?value as Record<string,unknown>:null
  if(q.type==='MATRIX'||q.type==='MATRIX_MULTIPLE') q.rows.forEach((r,i)=>{
    const suffix=`R${String(i+1).padStart(3,'0')}`
    add(`${suffix}_value`,` / ${r.label}`,'string',q.type==='MATRIX_MULTIPLE'?'JSON_STRING_ARRAY':'TEXT',value=>{
      const cell=object(value)?.[r.rowKey]??null
      return cell===null?null:q.type==='MATRIX_MULTIPLE'?canonicalJsonString(cell):cell
    },{rowKey:r.rowKey})
    add(`${suffix}_state`,` / ${r.label} 作答状态`,'string','STATE',(_value,state)=>state?.rowStates?.[r.rowKey]??null,{rowKey:r.rowKey})
  })
  if(q.type==='CONSTANT_SUM') q.options.forEach((o,i)=>add(`O${String(i+1).padStart(3,'0')}_value`,` / ${o.label}`,'numeric','NUMBER',value=>object(value)?.[o.optionKey]??null,{optionKey:o.optionKey}))
  if(detail==='full' && q.otherOptionKey) add('other_text',' 其他说明','string','JSON_STRING',(_value,state)=>state?.otherText===undefined?null:canonicalJsonString(state.otherText))
  return columns
}
