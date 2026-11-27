import {canonicalHash} from '../assessment-runtime/canonical'
import {prepareRelease,assetReference} from './release'
import type {StoredRelease} from './repository'
import {scaleMeasurementRelease} from './scale'
import type {ScaleDefinitionV2} from '../scale/scale-definition'
import type {AssessmentReferenceSetDefinition} from '../assessment-reference/reference'
import {frozenReportTemplateSchema,reportTemplateSchema,type ReportTemplate} from './report-template'
import {z} from 'zod'
export const standardCombinationPointerSchema=z.object({releaseId:z.string().guid(),combinationHash:z.string().regex(/^[a-f0-9]{64}$/)}).strict()

export const STANDARD_AXES=['CONTENT','PARAMETERS','REPORT'] as const
export type StandardAxis=typeof STANDARD_AXES[number]
export type StandardAxisHashes=Record<StandardAxis,string>
type AxisSnapshot={axis:StandardAxis;version:string;hash:string;sourceVersion:string;payload:unknown}
export type StandardCombinationSnapshot={
  toolKey:string;instrumentVersion:string;combinationHash:string;parts:Record<StandardAxis,AxisSnapshot>;definition:ScaleDefinitionV2
}
export type StandardCombinationRecord={
  id:string;tool_key:string;combination_hash:string;state:string;approved_by:string;snapshot:StandardCombinationSnapshot
  measurement_release:{releaseId:string;contentHash:string}|null
}
export function selectedStandardReport(payload:unknown){
 if(payload&&typeof payload==='object'&&'definition'in payload&&'template'in payload){
  const p=payload as {definition:ScaleDefinitionV2['report'];template:unknown;assetRefs?:unknown}
  return {definition:p.definition,template:reportTemplateSchema.parse(p.template),assetRefs:z.array(assetReference).parse(p.assetRefs??[])}
 }
 return {definition:payload as ScaleDefinitionV2['report']|null,template:null,assetRefs:[]}
}

function sharedTheoreticalBands(definition:ScaleDefinitionV2,references:readonly AssessmentReferenceSetDefinition[],metricKey:string){
 const choices=definition.referencePolicy.type==='declared'
  ?definition.referencePolicy.selections.filter(s=>s.scoreKey===metricKey):[]
 if(choices.length!==1||choices[0].referenceKind!=='theoretical_range')return null
 const sets=references.filter(r=>r.referenceVersion===choices[0].referenceVersion)
 if(sets.length!==1||sets[0].status!=='ACTIVE')return null
 const entries=sets[0].entries.filter(entry=>entry.scoreKey===metricKey&&entry.referenceKind==='theoretical_range')
 if(!entries.length||entries.some(entry=>entry.evidenceLevel!=='theoretical'||entry.governance?.kind!=='THEORETICAL_RANGE'))return null
 const tables=entries.map(entry=>entry.governance!.bands.map(({key,lower,upper})=>({key,lower,upper})))
 const [ranges]=tables
 if(tables.some(table=>canonicalHash(table)!==canonicalHash(ranges)))return null
 return {metricKey,ranges}
}

/** One mechanical R adapter for both entries. Titles/text come from the stored
 * approved source; this does not consult a newer registry or rewrite prose. */
export function compileStandardCombinationReport(title:string,definition:ScaleDefinitionV2,configured:boolean,references:readonly AssessmentReferenceSetDefinition[]=[]){
 const blocks:ReportTemplate['blocks']=[],blockers:string[]=[]
 let standardScoreBands:ReportTemplate['standardScoreBands']
 if(configured)for(const key of definition.report.scoreOrder){
  const score=definition.scoring.scores.find(s=>s.key===key),text=definition.report.interpretations.find(r=>r.scoreKey===key)
  if(!score||!text){blockers.push('报告缺少指标或解释：'+key);continue}
  if(text.source.type==='shared_theoretical_range'){
   const table=sharedTheoreticalBands(definition,references,key)
   if(standardScoreBands||!table||table.ranges.length!==text.bands.length
      ||table.ranges.some(range=>!text.bands.some(b=>b.key===range.key))){
    blockers.push('均分反馈要求所选参数的全部适用范围使用同一套完整理论分段：'+key)
   }else standardScoreBands=table
  }
  blocks.push({type:'METRIC',metricKey:key,label:text.scoreLabel??score.label,display:'RAW'})
  const narrative:ReportTemplate['blocks']=[{type:'TEXT',text:text.headline+'\n'+text.summary},...text.guidance.map(entry=>({type:'TEXT' as const,text:entry.text}))]
  if(!definition.report.illustrationKey)blocks.push(...narrative)
  const selected=definition.referencePolicy.type==='declared'?definition.referencePolicy.selections.filter(s=>s.scoreKey===key):[]
  for(const band of text.bands)for(const selection of selected)blocks.push({type:'REFERENCE_BAND',metricKey:key,referenceKind:selection.referenceKind,bandKey:band.key,text:band.label+'\n'+band.summary,guidance:band.guidance.map(g=>g.text)})
  if(definition.report.illustrationKey)blocks.push(...narrative)
 }
 return {template:configured?frozenReportTemplateSchema.parse({title,blocks,...(standardScoreBands?{standardScoreBands}:{}),...(definition.report.illustrationKey?{illustrationKey:definition.report.illustrationKey}:{}),limitations:definition.report.limitations,disclaimer:definition.report.disclaimer}):null,blockers}
}

/** Preserve the existing approved-combination hash scheme byte for byte.
 * Axis hashes identify snapshots; they are never formal release contentHash values. */
export const standardAxisHashes=(parts:Record<StandardAxis,{hash:string}>):StandardAxisHashes=>({
  CONTENT:parts.CONTENT.hash,PARAMETERS:parts.PARAMETERS.hash,REPORT:parts.REPORT.hash,
})
export const standardCombinationHash=(toolKey:string,hashes:StandardAxisHashes)=>canonicalHash({toolKey,
  CONTENT:hashes.CONTENT,PARAMETERS:hashes.PARAMETERS,REPORT:hashes.REPORT})

/** The approved row currently records only its platform MEASUREMENT pointer.
 * Reuse its existing producer contract; no Survey PRIVATE copy is made here. */
export function standardCombinationMeasurementInput(row:StandardCombinationRecord){
  const t=row.snapshot
  return scaleMeasurementRelease({localId:'survey-standard:'+t.toolKey,version:t.parts.CONTENT.hash,
    instrumentVersion:t.instrumentVersion,definition:t.definition,instrumentClass:'STANDARD',
    scope:{kind:'PLATFORM',ownerId:row.approved_by},
    provenance:{surveyStandardContentHash:t.parts.CONTENT.hash,toolKey:t.toolKey}})
}

/** Read-only management mapping of existing facts, shared by both entry views.
 * NOT_EVALUATED never means missing/approved. This view is not a use permission,
 * entry admission, trial, release publisher or frozen-runtime binding. */
export function describeStandardCombination(row:StandardCombinationRecord,measurement:StoredRelease|null){
  const t=row.snapshot,hashes=standardAxisHashes(t.parts),issues:string[]=[]
  if(row.tool_key!==t.toolKey||row.combination_hash!==t.combinationHash
    ||standardCombinationHash(t.toolKey,hashes)!==row.combination_hash)issues.push('COMBINATION_IDENTITY_MISMATCH')
  if(t.instrumentVersion!==t.parts.CONTENT.sourceVersion)issues.push('CONTENT_SOURCE_VERSION_MISMATCH')
  for(const axis of STANDARD_AXES){
    const part=t.parts[axis]
    if(part.axis!==axis||canonicalHash(part.payload)!==part.hash)issues.push(axis+'_SNAPSHOT_MISMATCH')
  }
  if(t.parts.CONTENT.payload===null)issues.push('CONTENT_REQUIRED')

  const pointer=row.measurement_release
  let contentStatus:'NOT_RECORDED'|'MISSING'|'IDENTITY_MISMATCH'|StoredRelease['status']='NOT_RECORDED'
  if(pointer){
    if(!measurement)contentStatus='MISSING'
    else{
      const expected=prepareRelease(standardCombinationMeasurementInput(row))
      const matches=measurement.releaseId===pointer.releaseId&&measurement.layer==='MEASUREMENT'&&measurement.family==='SCALE'
        &&measurement.contentHash===pointer.contentHash&&measurement.contentHash===expected.contentHash
        &&measurement.key===expected.key&&measurement.version===expected.version
        &&canonicalHash(measurement.scope)===canonicalHash(expected.scope)
        &&canonicalHash(measurement.provenance)===canonicalHash(expected.provenance)
        &&measurement.sourceReleaseId===expected.sourceReleaseId&&canonicalHash(measurement.assetRefs)===canonicalHash(expected.assetRefs)
      contentStatus=matches?measurement.status:'IDENTITY_MISMATCH'
    }
  }
  const axes=Object.fromEntries(STANDARD_AXES.map(axis=>{
    const p=t.parts[axis]
    return [axis,{version:p.version,axisHash:p.hash,sourceVersion:p.sourceVersion,
      configuration:p.payload===null?'EXPLICITLY_UNCONFIGURED' as const:'CONFIGURED' as const,
      formalReleaseBinding:axis==='CONTENT'&&pointer?'MEASUREMENT_POINTER' as const:'NOT_RECORDED_IN_COMBINATION' as const}]
  })) as Record<StandardAxis,{version:string;axisHash:string;sourceVersion:string;configuration:'CONFIGURED'|'EXPLICITLY_UNCONFIGURED';formalReleaseBinding:'MEASUREMENT_POINTER'|'NOT_RECORDED_IN_COMBINATION'}>
  return {
    identity:{releaseId:row.id,toolKey:t.toolKey,combinationHash:row.combination_hash},
    axisIdentity:{status:issues.length?'INVALID' as const:'VALID' as const,issues},
    compatibility:'NOT_EVALUATED' as const,
    approval:{state:row.state},axes,
    measurement:{pointer,status:contentStatus},
    consumers:{
      SURVEY:{sourceAdapter:'CONNECTED' as const,sourceRef:{kind:'SCALE' as const,sourceId:'survey-standard:'+row.id,sourceVersion:row.combination_hash},
        parameterReportBinding:'PROJECT_MATERIALIZATION' as const,entryAdmission:'NOT_EVALUATED' as const,targetUseGrant:'NOT_EVALUATED' as const},
      TRAINING:{sourceAdapter:'NOT_CONNECTED' as const,sourceRef:null,parameterReportBinding:'NOT_CONNECTED' as const,
        entryAdmission:'NOT_EVALUATED' as const,targetUseGrant:'NOT_EVALUATED' as const,
        missingContracts:['EXACT_COMBINATION_SOURCE','COMBINATION_ENTRY_ADMISSION','COMBINATION_TARGET_GRANT',
          'FROZEN_COMBINATION_BINDING','PARAMETER_REPORT_BINDING','CURRENT_COMBINATION_STOP_CHECK']},
    },
    runtimeAuthorization:'NOT_EVALUATED' as const,
  }
}
