import type {ScaleDefinitionV2} from '../scale/scale-definition'
import type {AssessmentReferenceSetDefinition,ReferenceKind} from '../assessment-reference/reference'
import type {ReportTemplate} from './report-template'

function selectedBandKeys(definition:ScaleDefinitionV2,references:readonly AssessmentReferenceSetDefinition[],scoreKey:string,required:{version?:string;kind?:ReferenceKind}={}){
 const selections=definition.referencePolicy.type==='declared'?definition.referencePolicy.selections.filter(s=>s.scoreKey===scoreKey
  &&(required.version===undefined||s.referenceVersion===required.version)&&(required.kind===undefined||s.referenceKind===required.kind)):[]
 const entries=selections.flatMap(selection=>references.filter(set=>set.referenceVersion===selection.referenceVersion)
  .flatMap(set=>set.entries.filter(entry=>entry.scoreKey===selection.scoreKey&&entry.referenceKind===selection.referenceKind)))
 // Match the native resolver: governance bands take precedence; only a
 // criterion_threshold entry otherwise emits statistics.thresholds as bands.
 return new Set(entries.flatMap(entry=>(entry.governance?.bands??
  (entry.referenceKind==='criterion_threshold'?entry.statistics.thresholds??[]:[])).map(band=>band.key)))
}

/** New-combination mechanical validation only. Extra P bands are permissible;
 * only bands actually requested by R need an exact selected provider. This does
 * not decide professional/population suitability or rewrite a frozen template. */
export function standardReportParameterBlockers(definition:ScaleDefinitionV2,references:readonly AssessmentReferenceSetDefinition[],configured:boolean,template?:ReportTemplate|null){
 if(!configured)return []
 const blockers:string[]=[]
 for(const report of definition.report.interpretations){
  if(!report.bands.length)continue
  const source=report.source
  const available=selectedBandKeys(definition,references,report.scoreKey,source.type==='reference'?{version:source.referenceVersion,kind:source.referenceKind}:{})
  for(const band of report.bands)if(!available.has(band.key))blockers.push('报告所需分档缺少选定参数支持：'+report.scoreKey+'/'+band.key)
 }
 // An explicitly selected R template can request bands independently of the
 // legacy report interpretations. Validate its actual executable references.
 for(const block of template?.blocks??[])if(block.type==='REFERENCE_BAND'
  &&!selectedBandKeys(definition,references,block.metricKey,{kind:block.referenceKind}).has(block.bandKey))
  blockers.push('报告所需分档缺少选定参数支持：'+block.metricKey+'/'+block.bandKey)
 return [...new Set(blockers)]
}
