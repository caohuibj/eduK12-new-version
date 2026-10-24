import type {Prisma} from '@prisma/client'
import {getContentRelease,publishContentRelease} from '../measurement-content/repository'
import {canonicalHash} from '../assessment-runtime/canonical'
import {referenceEntryKey} from '../measurement-content/reference-candidate'
import type {AssessmentReferenceEntry} from '../assessment-reference/reference'
import {DECLARATIVE_REPORT_GENERATOR} from '../measurement-content/report-renderer'
import type {ResearchFrozenUnit} from './publication.service'
import type {FrozenSurveyContentSelection} from './content-selection'
import {governedRow,governedFail} from './governed-tool.service'
export async function bindGovernedToolContent(tx:Prisma.TransactionClient,unit:ResearchFrozenUnit,actor:string){
 const id=unit.sourceProvenance?.surveyToolReleaseId
 if(typeof id!=='string')return
 const row=await governedRow(tx,id)
 if(row.state!=='ONLINE'||!row.snapshot.unit||canonicalHash(unit.compiledDefinition)!==canonicalHash(row.snapshot.unit.compiledDefinition))governedFail(409,'工具与已批准精确版本不一致')
 if(unit.kind==='FORM')return
 if(!unit.measurementRelease)governedFail(409,'工具测量发布缺失')
 const measurement=await getContentRelease(tx,unit.measurementRelease!.releaseId,true)
 if(!measurement||measurement.layer!=='MEASUREMENT'||measurement.status!=='PUBLISHED')governedFail(409,'项目测量版本不可用')
 const pointer={releaseId:measurement.releaseId,contentHash:measurement.contentHash},binding:FrozenSurveyContentSelection={referencePolicy:{policyVersion:'EXACT_POPULATION_PRIORITY_V1',measurementReleaseId:measurement.releaseId,choices:[]}},a=row.snapshot
 if(a.parameters){
  const entries=a.parameters.content.entries.map(e=>{const def=e.definition as unknown as AssessmentReferenceEntry;return {...e,definition:{...def,instrumentVersion:measurement.content.instrumentVersion,scoringVersion:measurement.content.scoringVersion,...(def.governance?{governance:{...def.governance,measurementHash:measurement.content.measurementHash}}:{})}}})
  const reference=await publishContentRelease(tx,{layer:'REFERENCE',family:measurement.family,key:'survey-governed-parameters:'+measurement.releaseId,version:a.parameters.contentHash,scope:measurement.scope,sourceReleaseId:a.parameters.releaseId,assetRefs:[],provenance:{approvedToolId:row.id,originalParameterRelease:a.parameters.releaseId,originalHash:a.parameters.contentHash},content:{projectionVersion:1,measurement:pointer,entries:entries as unknown as Extract<typeof a.parameters,{layer:'REFERENCE'}>['content']['entries'],evidence:a.parameters.content.evidence}},actor)
  for(const e of entries)binding.referencePolicy.choices.push({releaseId:reference.releaseId,contentHash:reference.contentHash,entryKey:referenceEntryKey(e.definition),priority:0,metricKey:e.metricKey,referenceKind:e.referenceKind})
 }
 if(a.report){
  const report=await publishContentRelease(tx,{layer:'REPORT',family:measurement.family,key:'survey-governed-report:'+measurement.releaseId,version:canonicalHash(a.report),scope:measurement.scope,sourceReleaseId:null,assetRefs:[],provenance:{approvedToolId:row.id,approvedHash:row.snapshot_hash,toolReference:row.reference},content:{projectionVersion:1,measurements:[pointer],metricKeys:measurement.content.metrics.map(m=>m.metricKey),audience:'researcher',language:measurement.content.locale,generatorVersion:DECLARATIVE_REPORT_GENERATOR,template:a.report.template}},actor)
  binding.reportRelease={releaseId:report.releaseId,contentHash:report.contentHash}
 }
 unit.contentSelection=binding
}
