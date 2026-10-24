import type {Prisma} from '@prisma/client'
import {canonicalHash} from '../assessment-runtime/canonical'
import {getContentRelease,publishContentRelease} from '../measurement-content/repository'
import {referenceEntryKey} from '../measurement-content/reference-candidate'
import {DECLARATIVE_REPORT_GENERATOR} from '../measurement-content/report-renderer'
import type {StoredRelease} from '../measurement-content/repository'
import type {FrozenSurveyContentSelection} from './content-selection'
import type {Triplet} from './standard-triplet.model'
import type {ResearchFrozenUnit} from './publication.service'
import {standardReleaseRow} from './standard-triplet.service'
/** Private exact copies are mechanically derived from the approved triplet, never a new grant. */
export async function copyTripletContent(tx:Prisma.TransactionClient,triplet:Triplet,measurement:Extract<StoredRelease,{layer:'MEASUREMENT'}>,actorId:string):Promise<FrozenSurveyContentSelection>{
 const pointer={releaseId:measurement.releaseId,contentHash:measurement.contentHash}
 const binding:FrozenSurveyContentSelection={referencePolicy:{policyVersion:'EXACT_POPULATION_PRIORITY_V1',measurementReleaseId:measurement.releaseId,choices:[]}}
 const provenance={surveyApprovedTriplet:triplet.combinationHash,toolReference:triplet.reference}
 for(const set of triplet.references){
  const entries=set.entries.map(e=>({...e,...(e.governance?{governance:{...e.governance,measurementHash:measurement.content.measurementHash}}:{})}))
  const release=await publishContentRelease(tx,{layer:'REFERENCE',family:'SCALE',key:'standard-parameters:'+measurement.releaseId+':'+canonicalHash(set.referenceVersion).slice(0,16),version:triplet.parts.PARAMETERS.hash,scope:measurement.scope,sourceReleaseId:null,assetRefs:[],provenance:{parameterHash:triplet.parts.PARAMETERS.hash,toolReference:triplet.parts.PARAMETERS.reference},
   content:{projectionVersion:1,measurement:pointer,entries:entries.map(e=>({metricKey:e.scoreKey,referenceKind:e.referenceKind,definition:e as unknown as Record<string,unknown>})),evidence:{sourceVersion:set.referenceVersion,parameterVersion:triplet.parts.PARAMETERS.version}}},actorId)
  const policy=triplet.definition.referencePolicy
  for(const entry of entries)if(policy.type==='declared'&&policy.selections.some(s=>s.referenceVersion===set.referenceVersion&&s.scoreKey===entry.scoreKey&&s.referenceKind===entry.referenceKind))binding.referencePolicy.choices.push({releaseId:release.releaseId,contentHash:release.contentHash,entryKey:referenceEntryKey(entry),priority:0,metricKey:entry.scoreKey,referenceKind:entry.referenceKind})
 }
 if(!triplet.template)return binding
 const report=await publishContentRelease(tx,{layer:'REPORT',family:'SCALE',key:'standard-report:'+measurement.releaseId,version:canonicalHash({parameters:triplet.parts.PARAMETERS.hash,report:triplet.parts.REPORT.hash}),scope:measurement.scope,sourceReleaseId:null,assetRefs:[],provenance,
  content:{projectionVersion:1,measurements:[pointer],metricKeys:triplet.definition.scoring.scores.map(s=>s.key),audience:'researcher',language:triplet.definition.versionAxes?.locale??'und',generatorVersion:DECLARATIVE_REPORT_GENERATOR,template:triplet.template}},actorId)
 binding.reportRelease={releaseId:report.releaseId,contentHash:report.contentHash}
 return binding
}
export async function bindApprovedTripletContent(tx:Prisma.TransactionClient,unit:ResearchFrozenUnit,actor:string){
 const id=unit.sourceProvenance?.surveyStandardReleaseId
 if(typeof id!=='string'||!unit.measurementRelease)return
 const row=await standardReleaseRow(tx,id)
 if(row.state!=='ONLINE'||unit.sourceProvenance?.sourceMeasurementRelease===undefined)throw new Error('批准组合已停止新增使用')
 if(canonicalHash(unit.compiledDefinition)!==canonicalHash(row.snapshot.definition))throw new Error('所用内容与批准的三版本组合不一致')
 const measurement=await getContentRelease(tx,unit.measurementRelease.releaseId,true)
 if(!measurement||measurement.layer!=='MEASUREMENT')throw new Error('项目测量版本缺失')
 unit.contentSelection=await copyTripletContent(tx,row.snapshot,measurement,actor)
}
