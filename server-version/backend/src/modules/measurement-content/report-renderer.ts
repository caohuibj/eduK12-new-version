import type { ReportTemplate } from './report-template'
import type { ReferenceKind } from '../assessment-reference/reference'
export const DECLARATIVE_REPORT_GENERATOR='DECLARATIVE_REPORT_V1'
export interface ReportMetricFact {metricKey:string;value:number|null;unit:string;status:'INTERPRETABLE'|'UNAVAILABLE'|'INVALID'}
export interface ReportReferenceFact {metricKey:string;referenceKind:ReferenceKind;status:'AVAILABLE'|'UNAVAILABLE';bandKey:string|null}
/** Data-only nodes; no scoring, HTML, script, latest lookup or reference calculation. */
export function renderDeclaredReport(template:ReportTemplate,metrics:readonly ReportMetricFact[],references:readonly ReportReferenceFact[]){
  const byMetric=new Map(metrics.map(m=>[m.metricKey,m]))
  if(byMetric.size!==metrics.length)throw new Error('REPORT_DUPLICATE_METRIC_FACT')
  const interpretable=(fact:ReportMetricFact|undefined)=>fact?.status==='INTERPRETABLE'&&typeof fact.value==='number'&&Number.isFinite(fact.value)
  const display=(key:string)=>{const fact=byMetric.get(key);return {metricKey:key,unit:fact?.unit??null,
    value:interpretable(fact)?fact!.value:null,
    status:fact?.status==='INTERPRETABLE'&&!interpretable(fact)?'UNAVAILABLE':fact?.status??'UNAVAILABLE'}}
  const blocks:unknown[]=template.blocks.flatMap((block):unknown[]=>{
    if(block.type==='METRIC')return [{...block,...display(block.metricKey),...(block.display==='REFERENCE_RESULT'?{value:null,referenceStatus:references.filter(r=>r.metricKey===block.metricKey).map(r=>({referenceKind:r.referenceKind,status:r.status}))}:{})}]
    if(block.type==='REFERENCE_BAND'){
      const fact=byMetric.get(block.metricKey),matches=references.filter(r=>r.metricKey===block.metricKey&&r.referenceKind===block.referenceKind)
      return interpretable(fact)&&matches.length===1&&matches[0].status==='AVAILABLE'&&matches[0].bandKey===block.bandKey?[block]:[]
    }
    if(block.type==='CHART')return [{...block,metrics:block.metricKeys.map(display)}]
    return [block]
  })
  return {generatorVersion:DECLARATIVE_REPORT_GENERATOR,title:template.title??null,blocks,limitations:template.limitations,disclaimer:template.disclaimer??null}
}
