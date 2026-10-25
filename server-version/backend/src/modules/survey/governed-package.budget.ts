import {renderDeclaredReport,type ReportMetricFact} from '../measurement-content/report-renderer'
import type {FormDraft,FormQuestion} from './builder.definition'
import type {PackageReport} from './governed-tool.model'

/** Same 4,000,000-byte ceiling as a Survey frozen publication, below the
 * compact-field codec's 8 MiB plaintext limit. This is a per-FINAL aggregate,
 * not 30 independent allowances. The legacy hex codec needs twice the bytes. */
export const PACKAGE_REPORT_MAX_BYTES=4_000_000
export const PACKAGE_REPORT_MAX_CIPHER_BYTES=2*PACKAGE_REPORT_MAX_BYTES+30*4096
export const jsonBytes=(value:unknown)=>Buffer.byteLength(JSON.stringify(value),'utf8')
const textBytes=(value:string)=>jsonBytes(value)-2
export class PackageReportBudgetError extends Error{readonly statusCode=409}
export function assertPackageReportBytes(bytes:number,kind='展开正文',limit=PACKAGE_REPORT_MAX_BYTES){
 if(!Number.isSafeInteger(bytes)||bytes<0||bytes>limit)throw new PackageReportBudgetError(`组合报告${kind}预算超限：${bytes} / ${limit} UTF-8 JSON 字节；请减少重复引用或调整字段上限，不截断答案`)
}
type Component={slotKey:string;unit:{ref:{kind:string};displayDefinition:unknown}}
function fieldBytes(q:FormQuestion){
 const missing=Math.max(...['明确拒答','未填写或未展示','未填写','未展示','无法判断'].map(textBytes))
 const labels=q.options.map(o=>textBytes(o.label)),one=Math.max(missing,...labels)
 const many=labels.reduce((n,b)=>n+b,0)+Math.max(0,labels.length-1)*textBytes('、')
 if(q.type==='MATRIX'||q.type==='MATRIX_MULTIPLE')return q.rows.reduce((n,row)=>n+textBytes(row.label)+textBytes('：')+Math.max(missing,q.type==='MATRIX_MULTIPLE'?many:one),0)+Math.max(0,q.rows.length-1)*textBytes('；')
 if(q.type==='SHORT_TEXT'||q.type==='LONG_TEXT')return Math.max(missing,6*(q.maxLength??(q.type==='SHORT_TEXT'?300:10000)))
 if(q.type==='MULTIPLE'||q.type==='RANK_ORDER')return Math.max(missing,many)
 if(q.type==='CONSTANT_SUM')return Math.max(missing,q.options.reduce((n,o)=>n+textBytes(o.optionKey)+textBytes('：')+32,0)+Math.max(0,q.options.length-1)*textBytes('；'))
 if(q.type==='NUMBER'||q.type==='SLIDER')return Math.max(missing,32)
 if(q.type==='DATE'||q.type==='TIME')return Math.max(missing,10)
 return one
}
/** Computes a conservative bound without constructing maximum answer strings.
 * JSON escaping can cost six bytes per UTF-16 code unit, even for control chars
 * or lone surrogates. Option/row labels are the exact frozen UTF-8 JSON text.
 * Repeated references each pay the entire expansion; conditions save no budget. */
export function packageReportWorstCaseBytes(spec:PackageReport,components:readonly Component[],packageTitle:string){
 const fields=new Map(components.filter(c=>c.unit.ref.kind==='FORM').map(c=>[c.slotKey,new Map((c.unit.displayDefinition as FormDraft).pages.flatMap(p=>p.questions).map(q=>[q.itemKey,q]))]))
 const blocks:Parameters<typeof renderDeclaredReport>[0]['blocks']=[],metrics:ReportMetricFact[]=[]
 let expansion=0
 if(spec.introduction)blocks.push({type:'TEXT',text:spec.introduction})
 spec.blocks.forEach((b,index)=>{
  if(b.type==='TEXT'){blocks.push(b);return}
  if(b.type==='FORM_FIELD'){
   const q=fields.get(b.slotKey)?.get(b.itemKey);if(!q)throw new Error('组合报告预算引用未固定表单字段：'+b.slotKey+'/'+b.itemKey)
   expansion+=fieldBytes(q);blocks.push({type:'TEXT',text:b.label+'：'})
  }else{
   const metricKey='combined_'+index;blocks.push({type:'METRIC',metricKey,label:b.label,display:'RAW'})
   metrics.push({metricKey,value:-Number.MAX_VALUE,unit:'u'.repeat(240),status:'INTERPRETABLE'})
  }
 })
 const report=renderDeclaredReport({title:spec.title,blocks,limitations:[],...(spec.disclaimer?{disclaimer:spec.disclaimer}:{})},metrics,[])
 return jsonBytes({schemaVersion:1,packageTitle,packageVersionHash:'0'.repeat(64),reportVersion:spec.version,sourceFinalHash:'0'.repeat(64),report})+expansion+4096
}
