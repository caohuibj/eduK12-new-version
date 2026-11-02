import {z} from 'zod'
import {assessmentKeySchema as key} from '../definition-primitives'
import type {FormDraft} from './definition'

/** Frozen ordinal descriptions, never a formula language or a Scale score. */
export const formDescriptiveSchema=z.object({
 version:z.literal('ordinal-description-v1'),
 selfAudience:z.enum(['TEACHER','NONE']),
 items:z.array(z.object({itemKey:key,
  values:z.array(z.object({optionKey:key,code:z.number().int().min(0).max(4)}).strict()).min(2).max(5),
  nonresponseOptionKeys:z.array(key).max(5),
 }).strict()).min(1).max(100),
 exploratoryMeans:z.boolean(),
 groups:z.array(z.object({key,label:z.string().trim().min(1).max(200),itemKeys:z.array(key).min(2).max(3)}).strict()).max(40),
}).strict()
export type FormDescriptive=z.infer<typeof formDescriptiveSchema>
export function formDescriptiveIssues(form:FormDraft){
 const d=form.descriptive;if(!d)return []
 const issues:Array<{path:string;message:string;severity:'error'}>=[]
 const fail=(message:string)=>issues.push({path:'descriptive',message,severity:'error'})
 if(form.schemaVersion!==2)fail('描述规则仅适用于 Form V2')
 if(new Set(d.items.map(i=>i.itemKey)).size!==d.items.length)fail('描述条目不能重复')
 for(const item of d.items){
  const q=form.pages.flatMap(p=>p.questions).find(q=>q.itemKey===item.itemKey)
  const opts=[...item.values.map(v=>v.optionKey),...item.nonresponseOptionKeys]
  if(!q||!['SINGLE','LIKERT'].includes(q.type)||q.otherOptionKey||q.options.some(o=>o.score!==undefined)
   ||opts.length!==q.options.length||new Set(opts).size!==opts.length||q.options.some(o=>!opts.includes(o.optionKey)))fail('描述规则必须完整区分本题有序选项和非回答选项，不能包含分数或文本')
  const codes=item.values.map(v=>v.code).sort((a,b)=>a-b)
  if(codes.some((code,i)=>code!==i))fail('有序类别代码必须从 0 连续排列，不是能力刻度')
 }
 if(new Set(d.groups.map(g=>g.key)).size!==d.groups.length)fail('专题编码不能重复')
 const grouped=d.groups.flatMap(g=>g.itemKeys)
 if(new Set(grouped).size!==grouped.length)fail('同一条目不能跨专题重复计算')
 for(const g of d.groups){
  const items=g.itemKeys.map(k=>d.items.find(i=>i.itemKey===k))
  if(items.some(i=>!i)||new Set(items.map(i=>i?.values.length)).size!==1)fail('专题必须引用使用相同类别数的完整条目')
 }
 return issues
}
export function describeFormResponse(form:FormDraft,answers:Record<string,unknown>,missing:readonly {itemKey:string;reason:string}[]){
 const d=form.descriptive;if(!d)return null
 if(formDescriptiveIssues(form).length)throw new Error('FORM_DESCRIPTIVE_DEFINITION_INVALID')
 const items=d.items.map(rule=>{
  const q=form.pages.flatMap(p=>p.questions).find(q=>q.itemKey===rule.itemKey)!
  const value=answers[rule.itemKey],reason=missing.find(m=>m.itemKey===rule.itemKey)?.reason
  if(reason&&value!==undefined)throw new Error('FORM_DESCRIPTIVE_FINAL_INVALID')
  const option=q.options.find(o=>o.optionKey===value),coded=rule.values.find(v=>v.optionKey===value)
  if(value!==undefined&&!option)throw new Error('FORM_DESCRIPTIVE_FINAL_INVALID')
  if(value===undefined&&!['REFUSED','SHOWN_MISSING','NOT_SHOWN'].includes(reason??''))throw new Error('FORM_DESCRIPTIVE_FINAL_INVALID')
  return {itemKey:rule.itemKey,prompt:q.prompt,label:option?.label??(reason==='REFUSED'?'明确拒答':reason==='NOT_SHOWN'?'未呈现':'跳过'),
   code:coded?.code??null,state:reason??(coded?'VALID':'NONRESPONSE_OPTION')}
 })
 const means=d.exploratoryMeans?d.groups.map(g=>{
  const values=g.itemKeys.map(k=>items.find(i=>i.itemKey===k)!.code),complete=values.every(v=>v!==null)
  return {key:g.key,label:g.label,completeItems:values.filter(v=>v!==null).length,expectedItems:values.length,
   value:complete?(values as number[]).reduce((a,b)=>a+b,0)/values.length:null}
 }):[]
 return {version:d.version,items,exploratoryMeans:means,note:'类别代码用于描述本次回答；完整题均值仅为预先声明的探索描述，不是能力、教学质量或常模分。'}
}
