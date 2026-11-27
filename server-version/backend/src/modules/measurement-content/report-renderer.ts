import type { ReportTemplate } from './report-template'
import type { ReferenceKind } from '../assessment-reference/reference'
import type { DisclosureCapabilitiesV1 } from '../scale/policy/types'
import { governanceBandFor } from '../assessment-reference/governance'
export const DECLARATIVE_REPORT_GENERATOR='DECLARATIVE_REPORT_V1'
export interface ReportMetricFact {metricKey:string;value:number|null;unit:string;status:'INTERPRETABLE'|'UNAVAILABLE'|'INVALID'}
export interface ReportReferenceFact {metricKey:string;referenceKind:ReferenceKind;status:'AVAILABLE'|'UNAVAILABLE';bandKey:string|null;reason?:string}
/** Data-only nodes; no scoring, HTML, script, latest lookup or reference calculation. */
export function renderDeclaredReport(template:ReportTemplate,metrics:readonly ReportMetricFact[],references:readonly ReportReferenceFact[],visibility?:DisclosureCapabilitiesV1){
  const byMetric=new Map(metrics.map(m=>[m.metricKey,m]))
  if(byMetric.size!==metrics.length)throw new Error('REPORT_DUPLICATE_METRIC_FACT')
  const interpretable=(fact:ReportMetricFact|undefined):fact is ReportMetricFact&{value:number}=>fact?.status==='INTERPRETABLE'&&typeof fact.value==='number'&&Number.isFinite(fact.value)
  const display=(key:string)=>{const fact=byMetric.get(key);return {metricKey:key,unit:fact?.unit??null,
    value:interpretable(fact)?fact!.value:null,
    status:fact?.status==='INTERPRETABLE'&&!interpretable(fact)?'UNAVAILABLE':fact?.status??'UNAVAILABLE'}}
  const mayShowText=!visibility||visibility.individualInterpretations||visibility.educationalContent
  const mayShowArtwork=!visibility||(visibility.artwork??(visibility.educationalContent||visibility.individualInterpretations))
  const mayShowReference=!visibility||(visibility.references&&visibility.scoreDerivedLabels)
  const blocks:unknown[]=template.blocks.flatMap((block):unknown[]=>{
    if(block.type==='TEXT')return mayShowText?[block]:[]
    if(block.type==='ASSET')return mayShowArtwork?[block]:[]
    if(visibility&&block.type==='METRIC'&&(block.display==='RAW'?!visibility.numericScores:!mayShowReference))return []
    if(visibility&&block.type==='CHART'&&!visibility.numericScores)return []
    if(block.type==='METRIC')return [{...block,...display(block.metricKey),...(block.display==='REFERENCE_RESULT'?{value:null,referenceStatus:references.filter(r=>r.metricKey===block.metricKey).map(r=>({referenceKind:r.referenceKind,status:r.status}))}:{})}]
    if(block.type==='REFERENCE_BAND'){
      if(!mayShowReference||visibility&&!visibility.individualInterpretations)return []
      const fact=byMetric.get(block.metricKey),matches=references.filter(r=>r.metricKey===block.metricKey&&r.referenceKind===block.referenceKind)
      const standard=template.standardScoreBands
      if(standard?.metricKey===block.metricKey&&block.referenceKind==='theoretical_range'&&interpretable(fact)&&matches.length===1&&matches[0].reason==='MISSING_CONTEXT'){
        return governanceBandFor(standard.ranges,fact.value)?.key===block.bandKey?[block]:[]
      }
      return interpretable(fact)&&matches.length===1&&matches[0].status==='AVAILABLE'&&matches[0].bandKey===block.bandKey?[block]:[]
    }
    if(block.type==='CHART')return [{...block,metrics:block.metricKeys.map(display)}]
    return [block]
  })
  return {generatorVersion:DECLARATIVE_REPORT_GENERATOR,
    ...(mayShowArtwork&&template.illustrationKey?{illustrationKey:template.illustrationKey}:{}),
    ...(mayShowArtwork&&template.artworkKey?{artworkKey:template.artworkKey}:{}),
    title:template.title??null,blocks,limitations:template.limitations,disclaimer:template.disclaimer??null}
}
