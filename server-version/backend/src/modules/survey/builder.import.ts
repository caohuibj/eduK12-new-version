import { parseText, parseCsv, type ImportRow, type ImportIssue } from '../assessment-core/form/import-parser'
import { z } from 'zod'
import { canonicalHash } from '../assessment-runtime/canonical'
import {
  assertSurveyDraft, scaleDraftSchema, surveyKeySchema,
  validateSurveyDraft, type FormDraft, type ScaleDraft,
} from './builder.definition'

const key=surveyKeySchema
export const bulkInputSchema=z.object({
  format:z.enum(['TEXT','CSV']),content:z.string().min(1).max(200000),
  batchId:z.string().uuid(),
  pageKey:key.optional(),dimensionKey:key.optional(),
}).strict()
export type BulkInput=z.infer<typeof bulkInputSchema>
const mk=(batchId:string,path:string)=>'r'+canonicalHash({batchId,path}).slice(0,24)
export function previewBulk(input:BulkInput,kind:'FORM'|'SCALE',formSchemaVersion?:1|2):{
  ok:boolean;issues:ImportIssue[];digest:string;items:ImportRow[];count:number
}{
  const parsed=bulkInputSchema.parse(input)
  const extracted=parsed.format==='TEXT'?parseText(parsed.content):parseCsv(parsed.content)
  const issues=[...extracted.issues]
  if(extracted.rows.length>200)issues.push({line:1,message:'单次最多导入 200 道题'})
  extracted.rows.forEach((r,i)=>{
    const line=r.sourceLine||i+1
    if(r.prompt.length>16000)issues.push({line,message:'题干超出最大长度'})
    if(r.options.some(o=>o.length>2000)||r.rows.some(o=>o.length>2000))
      issues.push({line,message:'选项或矩阵行超过最大长度'})
    if(kind==='SCALE'){
      if(!['SINGLE','LIKERT'].includes(r.type))issues.push({line,message:'量表仅支持单选/Likert 题块'})
      if(r.options.length)issues.push({line,message:'量表使用共享选项组，CSV 不应重复声明选项'})
      if(!r.required)issues.push({line,message:'首版描述性量表要求完整作答'})
    }else {
      const professional=['DATE','TIME','RANK_ORDER','SLIDER','CONSTANT_SUM','MATRIX_MULTIPLE']
      if(formSchemaVersion===1&&professional.includes(r.type))
        issues.push({line,message:'请先在 Builder 中将 Form 显式升级至 V2，再导入专业题型'})
      const choices=['SINGLE','MULTIPLE','MATRIX','LIKERT','RANK_ORDER','CONSTANT_SUM','MATRIX_MULTIPLE']
      if(choices.includes(r.type)&&r.options.length<2)
        issues.push({line,message:'选择题至少需要两项选项'})
      if(['MATRIX','MATRIX_MULTIPLE'].includes(r.type)&&!r.rows.length)
        issues.push({line,message:'矩阵题必须包含行'})
      if(!choices.includes(r.type)&&r.options.length)
        issues.push({line,message:'此题型不可声明选项'})
      if(r.type==='SLIDER'&&(r.min===undefined||r.max===undefined))
        issues.push({line,message:'Slider 必须提供 min/max'})
      if(r.type==='CONSTANT_SUM'&&r.total===undefined)
        issues.push({line,message:'Constant Sum 必须提供 total'})
    }
  })
  const digest=canonicalHash(JSON.parse(JSON.stringify({kind,batchId:parsed.batchId,pageKey:parsed.pageKey??null,
    dimensionKey:parsed.dimensionKey??null,items:extracted.rows})))
  return {ok:issues.length===0,issues,digest,items:extracted.rows,count:extracted.rows.length}
}
export function applyBulk(kind:'FORM'|'SCALE',definition:unknown,input:BulkInput,digest:string){
  const parsedForm=kind==='FORM'?(assertSurveyDraft('FORM',definition) as FormDraft):null
  const pre=previewBulk(input,kind,parsedForm?.schemaVersion)
  if(!pre.ok||pre.digest!==digest)throw new BulkImportError(
    !pre.ok?pre.issues:[{line:1,message:'预览数据已发生变化，请重新预览'}])
  if(kind==='FORM'){
    const d=parsedForm!
    const pageKey=input.pageKey??d.pages[0]?.pageKey??mk(input.batchId,'page')
    const page=d.pages.find(p=>p.pageKey===pageKey)
    if(input.pageKey&&!page)throw new BulkImportError([{line:1,message:'目标分页不存在'}])
    const qs=pre.items.map((r,i)=>({
      itemKey:mk(input.batchId,'item'+i),type:r.type,prompt:r.prompt,required:r.required,
      options:r.options.map((s,j)=>({optionKey:mk(input.batchId,'option'+i+'-'+j),label:s})),
      rows:r.rows.map((s,j)=>({rowKey:mk(input.batchId,'row'+i+'-'+j),label:s})),
      ...(r.min!==undefined?{min:r.min}:{}),...(r.max!==undefined?{max:r.max}:{}),
      ...(r.step!==undefined?{step:r.step}:{}),
      ...(r.precision!==undefined?{precision:r.precision}:{}),
      ...(r.total!==undefined?{total:r.total}:{}),
      ...(r.minSelections!==undefined?{minSelections:r.minSelections}:{}),
      ...(r.maxSelections!==undefined?{maxSelections:r.maxSelections}:{}),
      ...(r.integerOnly!==undefined?{integerOnly:r.integerOnly}:{}),
      ...(r.timeZone?{timeZone:r.timeZone}:{}),
    }))
    const next:FormDraft={...d,pages:page?
      d.pages.map(p=>p.pageKey===pageKey?{...p,questions:[...p.questions,...qs]}:p):
      [...d.pages,{pageKey,title:'问卷页面',questions:qs}]}
    const v=validateSurveyDraft(kind,next,false)
    if(v.issues.length)throw new BulkImportError(v.issues.map(e=>({line:1,message:e.message})))
    return next
  }
  const d=scaleDraftSchema.parse(definition)
  const fallback=input.dimensionKey??d.dimensions[0]?.dimensionKey
  if(!fallback||!d.dimensions.some(x=>x.dimensionKey===fallback))
    throw new BulkImportError([{line:1,message:'导入量表前需先建立至少一个计分维度'}])
  const qs=pre.items.map((r,i)=>{
    const dimension=r.dimensionKey||fallback
    if(!d.dimensions.some(x=>x.dimensionKey===dimension))
      throw new BulkImportError([{line:i+1,message:'指定的量表维度不存在：'+dimension}])
    return {itemKey:mk(input.batchId,'item'+i),prompt:r.prompt,required:true,
      reverse:r.reverse,dimensionKeys:[dimension]}
  })
  const next:ScaleDraft={...d,items:[...d.items,...qs]}
  const v=validateSurveyDraft(kind,next,false)
  if(v.issues.length)throw new BulkImportError(v.issues.map(e=>({line:1,message:e.message})))
  return next
}
export class BulkImportError extends Error {
  constructor(readonly issues:ImportIssue[]){super('批量导入未通过校验')}
}
