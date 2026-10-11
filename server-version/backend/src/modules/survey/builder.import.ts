import { z } from 'zod'
import { canonicalHash } from '../assessment-runtime/canonical'
import {
  formDraftSchema, scaleDraftSchema, surveyKeySchema,
  validateSurveyDraft, type FormDraft, type ScaleDraft, type Issue,
} from './builder.definition'

const key=surveyKeySchema
export const bulkInputSchema=z.object({
  format:z.enum(['TEXT','CSV']),content:z.string().min(1).max(200000),
  batchId:z.string().uuid(),
  pageKey:key.optional(),dimensionKey:key.optional(),
}).strict()
export type BulkInput=z.infer<typeof bulkInputSchema>
type ImportRow={type:'SINGLE'|'MULTIPLE'|'SHORT_TEXT'|'LONG_TEXT'|'NUMBER'|'LIKERT'|'MATRIX';
  prompt:string;required:boolean;options:string[];rows:string[];dimensionKey?:string;reverse:boolean}
type ImportIssue={line:number;message:string}
const types:Record<string,ImportRow['type']>={
  single:'SINGLE',choice:'SINGLE',select:'SINGLE',单选:'SINGLE',
  multiple:'MULTIPLE',多选:'MULTIPLE',likert:'LIKERT',量表:'LIKERT',
  text:'SHORT_TEXT',文本:'SHORT_TEXT',long_text:'LONG_TEXT',长文本:'LONG_TEXT',
  number:'NUMBER',数值:'NUMBER',matrix:'MATRIX',矩阵:'MATRIX',
}
const clean=(s:string)=>s.replace(/^\uFEFF/,'').trim()
const splitOptions=(s:string)=>s.split('||').map(clean).filter(Boolean)
const parseBoolean=(s:string,defaultValue:boolean):boolean|null=>{
  if(!s.trim())return defaultValue
  if(['true','yes','1','是','必答'].includes(s.trim().toLowerCase()))return true
  if(['false','no','0','否','选答'].includes(s.trim().toLowerCase()))return false
  return null
}
const parseText=(input:string):{rows:ImportRow[];issues:ImportIssue[]}=>{
  const rows:ImportRow[]=[],issues:ImportIssue[]=[]
  const blocks=input.replace(/\r\n?/g,'\n').trim().split(/\n\s*\n/)
  for(let i=0;i<blocks.length;i++){
    const lines=blocks[i].split('\n').map(clean).filter(Boolean)
    if(!lines.length)continue
    const prompt=lines[0]
    const options=lines.slice(1).map(x=>x.replace(/^(?:[A-Za-z0-9]{1,3}[.．)、:]\s*)/,'').trim())
    if(!prompt){issues.push({line:i+1,message:'缺少题干'});continue}
    const type=options.length?'SINGLE':'SHORT_TEXT'
    if(options.length===1)issues.push({line:i+1,message:'选择题至少需要两个选项'})
    rows.push({type,prompt,required:true,options,rows:[],reverse:false})
  }
  if(!rows.length)issues.push({line:1,message:'没有识别到可导入题目'})
  return {rows,issues}
}
/** Quoted CSV, including embedded commas/newlines and doubled quote escaping. */
const parseCsvRows=(content:string):string[][]=>{
  const rows:string[][]=[]
  let line:string[]=[],field='',quoted=false
  const s=content.replace(/^\uFEFF/,'')
  for(let i=0;i<s.length;i++){
    const c=s[i]
    if(quoted){
      if(c==='"'&&s[i+1]==='"'){field+='"';i++}
      else if(c==='"')quoted=false
      else field+=c
      continue
    }
    if(c==='"'){
      if(field)throw new Error('CSV 引号只能包裹完整单元格')
      quoted=true
    }else if(c===','){line.push(field);field=''}
    else if(c==='\n'){line.push(field);rows.push(line);line=[];field=''}
    else if(c==='\r'){if(s[i+1]==='\n')continue;line.push(field);rows.push(line);line=[];field=''}
    else field+=c
  }
  if(quoted)throw new Error('CSV 引号未闭合')
  if(field||line.length){line.push(field);rows.push(line)}
  return rows
}
const parseCsv=(content:string):{rows:ImportRow[];issues:ImportIssue[]}=>{
  const rows:ImportRow[]=[],issues:ImportIssue[]=[]
  let matrix:string[][]
  try{matrix=parseCsvRows(content)}catch(error){return {rows,issues:[{line:1,message:error instanceof Error?error.message:'CSV 格式错误'}]}}
  if(!matrix.length)return {rows,issues:[{line:1,message:'CSV 为空'}]}
  const header=matrix[0].map(s=>clean(s).toLowerCase())
  for(const required of ['type','prompt'])if(!header.includes(required))
    issues.push({line:1,message:'缺少必需表头：'+required})
  if(new Set(header).size!==header.length)issues.push({line:1,message:'表头不能重复'})
  if(issues.length)return {rows,issues}
  const field=(cells:string[],name:string)=>cells[header.indexOf(name)]??''
  for(let i=1;i<matrix.length;i++){
    const cells=matrix[i]
    if(cells.every(x=>!x.trim()))continue
    const type=types[clean(field(cells,'type')).toLowerCase()]
    if(!type){issues.push({line:i+1,message:'未知题型'});continue}
    const prompt=clean(field(cells,'prompt'))
    if(!prompt){issues.push({line:i+1,message:'题干不能为空'});continue}
    const required=parseBoolean(field(cells,'required'),true)
    const reverse=parseBoolean(field(cells,'reverse'),false)
    if(required===null||reverse===null){issues.push({line:i+1,message:'required/reverse 应填 true 或 false'});continue}
    const options=splitOptions(field(cells,'options'))
    const matrixRows=splitOptions(field(cells,'rows'))
    rows.push({type,prompt,required,options,rows:matrixRows,
      reverse,dimensionKey:clean(field(cells,'dimension'))||undefined})
  }
  if(!rows.length)issues.push({line:1,message:'未识别有效数据行'})
  return {rows,issues}
}
const mk=(batchId:string,path:string)=>'r'+canonicalHash({batchId,path}).slice(0,24)
export function previewBulk(input:BulkInput,kind:'FORM'|'SCALE'):{
  ok:boolean;issues:ImportIssue[];digest:string;items:ImportRow[];count:number
}{
  const parsed=bulkInputSchema.parse(input)
  const extracted=parsed.format==='TEXT'?parseText(parsed.content):parseCsv(parsed.content)
  const issues=[...extracted.issues]
  if(extracted.rows.length>200)issues.push({line:1,message:'单次最多导入 200 道题'})
  extracted.rows.forEach((r,i)=>{
    if(r.prompt.length>16000)issues.push({line:i+1,message:'题干超出最大长度'})
    if(r.options.some(o=>o.length>2000)||r.rows.some(o=>o.length>2000))
      issues.push({line:i+1,message:'选项或矩阵行超过最大长度'})
    if(kind==='SCALE'){
      if(!['SINGLE','LIKERT'].includes(r.type))issues.push({line:i+1,message:'量表仅支持单选/Likert 题块'})
      if(r.options.length)issues.push({line:i+1,message:'量表使用共享选项组，CSV 不应重复声明选项'})
      if(!r.required)issues.push({line:i+1,message:'首版描述性量表要求完整作答'})
    }else {
      if(['SINGLE','MULTIPLE','MATRIX','LIKERT'].includes(r.type)&&r.options.length<2)
        issues.push({line:i+1,message:'选择题至少需要两项选项'})
      if(r.type==='MATRIX'&&!r.rows.length)issues.push({line:i+1,message:'矩阵题必须包含行'})
      if(!['SINGLE','MULTIPLE','MATRIX','LIKERT'].includes(r.type)&&r.options.length)
        issues.push({line:i+1,message:'此题型不可声明选项'})
    }
  })
  const digest=canonicalHash(JSON.parse(JSON.stringify({kind,batchId:parsed.batchId,pageKey:parsed.pageKey??null,
    dimensionKey:parsed.dimensionKey??null,items:extracted.rows})))
  return {ok:issues.length===0,issues,digest,items:extracted.rows,count:extracted.rows.length}
}
export function applyBulk(kind:'FORM'|'SCALE',definition:unknown,input:BulkInput,digest:string){
  const pre=previewBulk(input,kind)
  if(!pre.ok||pre.digest!==digest)throw new BulkImportError(
    !pre.ok?pre.issues:[{line:1,message:'预览数据已发生变化，请重新预览'}])
  if(kind==='FORM'){
    const d=formDraftSchema.parse(definition)
    const pageKey=input.pageKey??d.pages[0]?.pageKey??mk(input.batchId,'page')
    const page=d.pages.find(p=>p.pageKey===pageKey)
    if(input.pageKey&&!page)throw new BulkImportError([{line:1,message:'目标分页不存在'}])
    const qs=pre.items.map((r,i)=>({
      itemKey:mk(input.batchId,'item'+i),type:r.type,prompt:r.prompt,required:r.required,
      options:r.options.map((s,j)=>({optionKey:mk(input.batchId,'option'+i+'-'+j),label:s})),
      rows:r.rows.map((s,j)=>({rowKey:mk(input.batchId,'row'+i+'-'+j),label:s})),
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
