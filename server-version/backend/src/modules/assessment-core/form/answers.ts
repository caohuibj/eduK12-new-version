/** Portable wire contract; the historical refusal tag is immutable. */
export class FormAnswerValidationError extends Error {
  constructor(readonly path:string,message:string){super(message)}
}
function invalid(path:string,message:string): never {throw new FormAnswerValidationError(path,message)}
/** Explicit refusal must not collide with participant-provided free text. */
export type ExplicitFormRefusal={_surveyRefusal:true}
export type AnswerPrimitive=string|number|string[]|Record<string,string|number|string[]>|ExplicitFormRefusal|null
export const isRefusal=(value:unknown):value is ExplicitFormRefusal=>
  !!value&&typeof value==='object'&&!Array.isArray(value)
  &&Object.keys(value).length===1&&(value as ExplicitFormRefusal)._surveyRefusal===true
export type AnswerMap=Record<string,AnswerPrimitive>
export interface MissingItem {itemKey:string;reason:'NOT_SHOWN'|'SHOWN_MISSING'|'REFUSED'|'UNABLE_TO_JUDGE'}
export const parseAnswerMap=(value:unknown,path:string):AnswerMap=>{
  if(!value||typeof value!=='object'||Array.isArray(value))invalid(path,'回答必须是题目到值的对象')
  const o=value as Record<string,unknown>
  if(Object.keys(o).length>500)invalid(path,'本轮提交的题目数量超限')
  if(Buffer.byteLength(JSON.stringify(o),'utf8')>512000)
    invalid(path,'单份工具提交不能超过 500 KB，请缩短答案')
  return o as AnswerMap
}
export const optionValue=(value:unknown,choices:string[],path:string,required:boolean):string|null=>{
  if(value===null||value===undefined||value===''){
    if(required)invalid(path,'必答题目未完成')
    return null
  }
  if(typeof value!=='string'||!choices.includes(value))invalid(path,'回答不是此题允许的选项')
  return value as string
}
