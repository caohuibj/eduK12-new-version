import type {ScaleDefinitionV2} from '../scale/scale-definition'
import type {AssessmentReferenceSetDefinition} from '../assessment-reference/reference'

/** New-combination mechanical validation only. Extra P bands are permissible;
 * only bands actually requested by R need an exact selected provider. This does
 * not decide professional/population suitability or rewrite a frozen template. */
export function standardReportParameterBlockers(definition:ScaleDefinitionV2,references:readonly AssessmentReferenceSetDefinition[],configured:boolean){
 if(!configured)return []
 const blockers:string[]=[]
 for(const report of definition.report.interpretations){
  if(!report.bands.length)continue
  const source=report.source
  const selections=definition.referencePolicy.type==='declared'?definition.referencePolicy.selections.filter(s=>s.scoreKey===report.scoreKey
   &&(source.type!=='reference'||s.referenceVersion===source.referenceVersion&&s.referenceKind===source.referenceKind)):[]
  const entries=selections.flatMap(selection=>references.filter(set=>set.referenceVersion===selection.referenceVersion)
   .flatMap(set=>set.entries.filter(entry=>entry.scoreKey===selection.scoreKey&&entry.referenceKind===selection.referenceKind)))
  // The native resolver emits governance bands when present; otherwise only
  // criterion_threshold can emit statistics.thresholds as criterionBand keys.
  const available=new Set(entries.flatMap(entry=>(entry.governance?.bands??
   (entry.referenceKind==='criterion_threshold'?entry.statistics.thresholds??[]:[])).map(band=>band.key)))
  for(const band of report.bands)if(!available.has(band.key))blockers.push('报告所需分档缺少选定参数支持：'+report.scoreKey+'/'+band.key)
 }
 return [...new Set(blockers)]
}
