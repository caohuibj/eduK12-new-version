import type { DisclosureCapabilitiesV1 } from '../scale/policy/types'
import type { ReportTemplate } from './report-template'
import { governanceBandFor } from '../assessment-reference/governance'
import type { ReferenceKind } from '../assessment-reference/reference'
export const DECLARATIVE_REPORT_GENERATOR='DECLARATIVE_REPORT_V1'
export interface ReportMetricFact {metricKey:string;value:number|null;unit:string;status:'INTERPRETABLE'|'UNAVAILABLE'|'INVALID'}
export interface ReportReferenceFact {metricKey:string;referenceKind:ReferenceKind;status:'AVAILABLE'|'UNAVAILABLE';bandKey:string|null;reason?:string}
/** Format already-authorized scores and frozen facts. No source lookup, scorer or norm calculation. */
export function renderDeclaredReport(template:ReportTemplate,metrics:readonly ReportMetricFact[],references:readonly ReportReferenceFact[],proseDisclosure?:Pick<DisclosureCapabilitiesV1,'individualInterpretations'|'educationalContent'|'scoreDerivedLabels'|'numericScores'|'references'>){
  const byMetric=new Map(metrics.map(m=>[m.metricKey,m]))
  if(byMetric.size!==metrics.length)throw new Error('REPORT_DUPLICATE_METRIC_FACT')
  const interpretable=(fact:ReportMetricFact|undefined):fact is ReportMetricFact & {value:number}=>fact?.status==='INTERPRETABLE'&&typeof fact.value==='number'&&Number.isFinite(fact.value)
  const display=(key:string)=>{const fact=byMetric.get(key);return {metricKey:key,unit:fact?.unit??null,
    value:interpretable(fact)?fact!.value:null,
    status:fact?.status==='INTERPRETABLE'&&!interpretable(fact)?'UNAVAILABLE':fact?.status??'UNAVAILABLE'}}
  const anchors=template.standardScoreBands
  // The original theoretical intervals include their upper bound. Keep the
  // authoritative score unchanged and return only the selected prose.
  const anchorScore=anchors&&byMetric.get(anchors.metricKey)
  const match=anchors&&interpretable(anchorScore)
    ? governanceBandFor(anchors.ranges,anchorScore.value)
    : undefined
  const mayShowBand=!proseDisclosure||(proseDisclosure.numericScores&&proseDisclosure.references&&proseDisclosure.individualInterpretations&&proseDisclosure.scoreDerivedLabels)
  const blocks:unknown[]=template.blocks.flatMap((block):unknown[]=>{
    if(block.type==='METRIC')return [{...block,...display(block.metricKey),...(block.display==='REFERENCE_RESULT'?{value:null,referenceStatus:references.filter(r=>r.metricKey===block.metricKey).map(r=>({referenceKind:r.referenceKind,status:r.status}))}:{})}]
    if(block.type==='REFERENCE_BAND'){
      const fact=byMetric.get(block.metricKey),matches=references.filter(r=>r.metricKey===block.metricKey&&r.referenceKind===block.referenceKind)
      if(anchors?.metricKey===block.metricKey&&block.referenceKind==='theoretical_range'){
        const ref=matches.length===1?matches[0]:undefined
        const usable=ref?.status==='AVAILABLE'?ref.bandKey===match?.key:ref?.reason==='MISSING_CONTEXT'
        if(!mayShowBand||!usable||!match||match.key!==block.bandKey)return []
        return [{type:'SCORE_FEEDBACK',metricKey:block.metricKey,bandKey:match.key,text:block.text,guidance:block.guidance}]
      }
      return interpretable(fact)&&matches.length===1&&matches[0].status==='AVAILABLE'&&matches[0].bandKey===block.bandKey?[block]:[]
    }
    if(block.type==='CHART')return [{...block,metrics:block.metricKeys.map(display)}]
    return [block]
  })
  const mayShowIllustration = !proseDisclosure || proseDisclosure.educationalContent || proseDisclosure.individualInterpretations
  return {generatorVersion:DECLARATIVE_REPORT_GENERATOR,...(template.illustrationKey && mayShowIllustration ? {illustrationKey:template.illustrationKey} : {}),title:template.title??null,blocks,limitations:template.limitations,disclaimer:template.disclaimer??null}
}
