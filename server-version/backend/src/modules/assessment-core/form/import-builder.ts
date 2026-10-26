import {canonicalHash} from '../../assessment-runtime/canonical'
import type {FormQuestion} from './definition'
import type {ImportRow,ImportIssue} from './import-parser'

/** Shared Survey/education import validation and stable identities; no persistence. */
export const formImportKey=(batchId:string,path:string)=>'r'+canonicalHash({batchId,path}).slice(0,24)
export function formImportIssues(rows:ImportRow[],version?:1|2):ImportIssue[]{
 const issues:ImportIssue[]=[]
 if(rows.length>200)issues.push({line:1,message:'单次最多导入 200 道题'})
 rows.forEach((r,i)=>{
  const line=r.sourceLine||i+1
  if(r.prompt.length>16000)issues.push({line,message:'题干超出最大长度'})
  if(r.options.some(o=>o.length>2000)||r.rows.some(o=>o.length>2000))issues.push({line,message:'选项或矩阵行超过最大长度'})
      const professional=['DATE','TIME','RANK_ORDER','SLIDER','CONSTANT_SUM','MATRIX_MULTIPLE']
      if(version===1&&professional.includes(r.type))
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
 })
 return issues
}
export function formImportQuestions(rows:ImportRow[],batchId:string):FormQuestion[]{
 return rows.map((r,i)=>({
      itemKey:formImportKey(batchId,'item'+i),type:r.type,prompt:r.prompt,required:r.required,
      options:r.options.map((s,j)=>({optionKey:formImportKey(batchId,'option'+i+'-'+j),label:s})),
      rows:r.rows.map((s,j)=>({rowKey:formImportKey(batchId,'row'+i+'-'+j),label:s})),
      ...(r.min!==undefined?{min:r.min}:{}),...(r.max!==undefined?{max:r.max}:{}),
      ...(r.step!==undefined?{step:r.step}:{}),
      ...(r.precision!==undefined?{precision:r.precision}:{}),
      ...(r.total!==undefined?{total:r.total}:{}),
      ...(r.minSelections!==undefined?{minSelections:r.minSelections}:{}),
      ...(r.maxSelections!==undefined?{maxSelections:r.maxSelections}:{}),
      ...(r.integerOnly!==undefined?{integerOnly:r.integerOnly}:{}),
      ...(r.timeZone?{timeZone:r.timeZone}:{}),
    }))
}
