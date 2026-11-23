import type {FormQuestion} from '../assessment-core/form/definition'
const states:Record<string,string>={REFUSED:'已明确拒答',SHOWN_MISSING:'未作答',NOT_SHOWN:'未显示'}
/** A display projection of an already verified FINAL and its own frozen definition.
 * It never replaces raw facts, hashes, receipts or report authority. */
export function fieldEvidenceDisplay(question:FormQuestion,fact:{state:string;value:unknown;rowStates?:Record<string,string>;otherText?:string}):string{
 if(fact.state!=='ANSWERED')return states[fact.state]??'未作答'
 const option=(value:unknown)=>question.options.find(o=>o.optionKey===String(value))?.label??'无法匹配原固定选项'
 const choice=(value:unknown)=>Array.isArray(value)?value.map(option).join('、'):option(value)
 let text:string
 if(['SINGLE','MULTIPLE','LIKERT'].includes(question.type))text=choice(fact.value)
 else if(question.type==='RANK_ORDER')text=Array.isArray(fact.value)?fact.value.map((key,index)=>`${index+1}. ${option(key)}`).join('；'):'未作答'
 else if(question.type==='MATRIX'||question.type==='MATRIX_MULTIPLE'){
  const values=fact.value&&typeof fact.value==='object'&&!Array.isArray(fact.value)?fact.value as Record<string,unknown>:{}
  text=question.rows.map(row=>`${row.label}：${fact.rowStates?.[row.rowKey]&&fact.rowStates[row.rowKey]!=='ANSWERED'?states[fact.rowStates[row.rowKey]]??'未作答':values[row.rowKey]===undefined?'未作答':choice(values[row.rowKey])}`).join('；')
 }else if(question.type==='CONSTANT_SUM'){
  const values=fact.value&&typeof fact.value==='object'&&!Array.isArray(fact.value)?fact.value as Record<string,unknown>:{}
  text=question.options.map(o=>`${o.label}：${values[o.optionKey]??'未作答'}`).join('；')
 }else text=fact.value==null?'未作答':String(fact.value)
 return text+(fact.otherText?'；其他说明：'+fact.otherText:'')
}
