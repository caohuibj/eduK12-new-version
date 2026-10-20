import type {Prisma} from '@prisma/client'
import type {CanonicalUnitResultCoreV1} from '../assessment-runtime/unit-result'
import {loadFrozenScaleRuntimeSnapshot} from '../assessment-runtime/runtime-snapshot'
import {readFrozenReport,hashResolvedConfig,type FrozenReportSnapshot} from '../cognitive/profile-freeze'
import {decryptCognitivePayload} from '../cognitive/cognitive.security'
import {loadSharedCognitiveRuntime} from '../assessment-runtime/shared-cognitive-runtime'
import {canonicalHash} from '../assessment-runtime/canonical'
import {ContentReleaseError} from '../measurement-content/release'
import type {ReportTemplate} from '../measurement-content/report-template'
import {resolveProjectionPolicyForAssessment} from '../scale/scale-workflow.service'
import {createScaleProjectionContext} from '../scale/projection/context-factory'
import {resolveEffectiveScaleDisclosure} from '../scale/projection/context'
import {DISCLOSURE_PRESETS,intersectDisclosureCapabilities} from '../scale/policy/disclosure'
import type {DisclosureCapabilitiesV1} from '../scale/policy/types'
import type {TrainingContentSnapshot} from './training-content-binding'

type Unit=TrainingContentSnapshot['units'][number]
export type TrainingReportAudience='teacher'|'researcher'
type Source={sourceType:string|null;sourceAttemptId:string|null;sourceSubmissionId?:string|null}
export interface TrainingMetricDisclosure {
 metricKeys:ReadonlySet<string>
 referenceMetricKeys:ReadonlySet<string>
 capabilities:DisclosureCapabilitiesV1
}
class TrainingDisclosureError extends ContentReleaseError {readonly statusCode=409}
function invalid():never{throw new TrainingDisclosureError('CONTENT_TRAINING_DISCLOSURE_SOURCE_INVALID')}
const cognitiveAssignmentSelect={id:true,createdBy:true,configId:true,courseId:true,listedStandalone:true,quotaSourceAssignmentId:true,
 profile:true,profileDefinitionVersion:true,resolvedConfigHash:true,resolvedConfigSnapshotEncrypted:true,resolvedReportSnapshotEncrypted:true,
 config:{select:{testType:true,configVersion:true,engineVersion:true,scoringVersion:true}}} as const

/** The teacher ceiling is the same frozen-definition rule used by Training
 * numeric analysis. A template's audience label is never an access grant.
 * Quality/process metrics remain numeric facts, not individual references. */
export function trainingCognitiveMetricKeys(report:FrozenReportSnapshot|null){
 const keys=new Set<string>()
 if(!report)return keys
 for(const [key,metric] of Object.entries(report.metricDefinitions)){
  if(!['number','integer'].includes(metric.valueType)||key==='productIndex'||key==='product_index')continue
  if(metric.role==='research_only'
   ||(report.profile==='research'&&!metric.availableProfiles?.includes('standard'))
   ||(metric.availableProfiles&&!metric.availableProfiles.includes('standard')))continue
  keys.add(key)
 }
 return keys
}

/** Re-read exact accepted child identity and frozen policy on every disclosure.
 * No current registry defaults, report grants, raw answers, result rewriting or
 * rescoring participate. Callers must already own current attempt data access. */
export async function loadTrainingMetricDisclosure(db:Prisma.TransactionClient,input:{
 parent:{id:string;attemptEpoch:number};unit:Unit;source:Source;audience:TrainingReportAudience;core?:CanonicalUnitResultCoreV1;metricKeys?:readonly string[]
}):Promise<TrainingMetricDisclosure>{
 const {parent,unit,source,core,audience}=input
 if(!['teacher','researcher'].includes(audience)||!source.sourceAttemptId)invalid()
 if(unit.family==='COGNITIVE'){
  if(unit.source.kind!=='COGNITIVE_CONFIG'||!unit.source.assignmentId||source.sourceType!=='COGNITIVE_SESSION')invalid()
  const child=await db.cognitiveSession.findUnique({where:{id:source.sourceAttemptId},select:{
   id:true,compositeAttemptId:true,compositeItemId:true,assignmentId:true,configId:true,status:true,deliveryMode:true,runtimeGeneration:true,
   submissionId:true,compiledRuntimeHash:true,testType:true,configVersion:true,engineVersion:true,scoringVersion:true,configSnapshotEncrypted:true,
   compositeAttempt:{select:{deliveryCourseId:true}},assignment:{select:cognitiveAssignmentSelect},
  }})
  if(!child||child.compositeAttemptId!==parent.id||child.compositeItemId!==unit.itemId
   ||child.configId!==unit.source.id||!child.assignment||child.assignment.id!==child.assignmentId||child.assignment.configId!==unit.source.id
   ||child.assignment.createdBy!==unit.source.ownerId
   ||child.status!=='COMPLETED'||child.deliveryMode!=='FINAL_ONLY'||child.runtimeGeneration!=='UNIFIED_V1'
   ||(child.submissionId??null)!==(source.sourceSubmissionId??null))invalid()
  const report=readFrozenReport(child.assignment.resolvedReportSnapshotEncrypted)
  if(!report||report.profile!==child.assignment.profile)invalid()
  if(child.assignmentId!==unit.source.assignmentId){
   // COURSE delivery intentionally copies the published null-course wrapper.
   // Accept that existing alias only with its exact frozen measurement/report,
   // source owner and original quota lineage, never merely a matching config ID.
   const published=await db.cognitiveAssignment.findUnique({where:{id:unit.source.assignmentId},select:cognitiveAssignmentSelect})
   const delivered=child.assignment
   if(!published||published.id!==unit.source.assignmentId||published.createdBy!==unit.source.ownerId||published.configId!==unit.source.id
    ||published.courseId!==null||published.listedStandalone!==false||delivered.listedStandalone!==false
    ||!delivered.courseId||delivered.courseId!==child.compositeAttempt?.deliveryCourseId
    ||delivered.quotaSourceAssignmentId!==(published.quotaSourceAssignmentId??published.id)
    ||!published.profile||published.profile!==delivered.profile||!published.profileDefinitionVersion
    ||published.profileDefinitionVersion!==delivered.profileDefinitionVersion||report.profileDefinitionVersion!==delivered.profileDefinitionVersion
    ||!published.resolvedConfigHash||published.resolvedConfigHash!==delivered.resolvedConfigHash
    ||!published.resolvedConfigSnapshotEncrypted||!delivered.resolvedConfigSnapshotEncrypted
    ||child.testType!==published.config.testType||child.configVersion!==published.config.configVersion
    ||child.engineVersion!==published.config.engineVersion||child.scoringVersion!==published.config.scoringVersion)invalid()
   try{
    const sourceConfig=decryptCognitivePayload(published.resolvedConfigSnapshotEncrypted)
    const deliveredConfig=decryptCognitivePayload(delivered.resolvedConfigSnapshotEncrypted)
    const sourceReport=readFrozenReport(published.resolvedReportSnapshotEncrypted)
    if(hashResolvedConfig(sourceConfig)!==published.resolvedConfigHash||hashResolvedConfig(deliveredConfig)!==published.resolvedConfigHash
     ||!sourceReport||canonicalHash(sourceReport)!==canonicalHash(report))invalid()
    const runtime=await loadSharedCognitiveRuntime(child.configSnapshotEncrypted,db)
    if(!runtime.snapshot||!runtime.compiledRuntime||runtime.snapshot.configHash!==published.resolvedConfigHash
     ||hashResolvedConfig(runtime.config)!==published.resolvedConfigHash||runtime.snapshot.configVersion!==child.configVersion
     ||runtime.snapshot.testType!==child.testType||runtime.snapshot.engineVersion!==child.engineVersion||runtime.snapshot.scoringVersion!==child.scoringVersion
     ||runtime.compiledRuntime.compiledRuntimeHash!==child.compiledRuntimeHash
     ||core&&core.sourceDefinitionHash!==runtime.compiledRuntime.sourceDefinitionHash)invalid()
   }catch{invalid()}
  }
  if(core&&(core.unitType!=='COGNITIVE'||core.instrumentKey!==child.testType||core.instrumentVersion!==child.engineVersion
   ||core.scorerVersion!==child.scoringVersion||core.compiledRuntimeHash!==child.compiledRuntimeHash
   ||core.scientificProvenance.profileKey!==report.profile
   ||(core.scientificProvenance.resolvedConfigHash??null)!==(child.assignment.resolvedConfigHash??null)))invalid()
  const metricKeys=trainingCognitiveMetricKeys(report)
  const referenceMetricKeys=new Set([...metricKeys].filter(key=>report.metricDefinitions[key].role!=='quality'
   &&report.metricDefinitions[key].role!=='research_only'&&report.v2MetricDefinitions?.[key]?.referenceEligible===true))
  return {metricKeys,referenceMetricKeys,capabilities:DISCLOSURE_PRESETS.FULL_REPORT()}
 }
 if(unit.family==='SCALE'){
  if(unit.source.kind!=='SCALE'||source.sourceType!=='ASSESSMENT')invalid()
  const child=await db.assessment.findUnique({where:{id:source.sourceAttemptId},select:{
   id:true,compositeAttemptId:true,compositeItemId:true,attemptEpoch:true,scaleId:true,status:true,deliveryMode:true,runtimeGeneration:true,
   submissionId:true,compiledRuntimeHash:true,runtimeSnapshotEncrypted:true,scale:{select:{id:true,instrumentClass:true}},
  }})
  if(!child||child.compositeAttemptId!==parent.id||child.compositeItemId!==unit.itemId||child.attemptEpoch!==parent.attemptEpoch
   ||child.scaleId!==unit.source.id||child.scale.id!==unit.source.id||child.status!=='COMPLETED'||child.deliveryMode!=='FINAL_ONLY'
   ||child.runtimeGeneration!=='UNIFIED_V1'||!child.runtimeSnapshotEncrypted
   ||(child.submissionId??null)!==(source.sourceSubmissionId??null))invalid()
  const runtime=await loadFrozenScaleRuntimeSnapshot(child.runtimeSnapshotEncrypted,db)
  if(runtime.compiledRuntime.compiledRuntimeHash!==child.compiledRuntimeHash
   ||core&&(core.unitType!=='SCALE'||core.compiledRuntimeHash!==runtime.compiledRuntime.compiledRuntimeHash
    ||core.instrumentKey!==runtime.instrumentKey||core.instrumentVersion!==runtime.instrumentVersion
    ||core.sourceDefinitionHash!==runtime.sourceDefinitionHash||core.scorerVersion!==runtime.compiledRuntime.scorerVersion))invalid()
  const policy=resolveProjectionPolicyForAssessment({...child,scale:{...child.scale,code:runtime.instrumentKey,instrumentVersion:runtime.instrumentVersion}},null,runtime)
  if(policy.snapshotError)invalid()
  const context=createScaleProjectionContext({instrumentKey:runtime.instrumentKey,
   // The present caller's researcher label is only an ADMIN role mapping,
   // not a separately verified scientific/data grant. Never widen teacher
   // disclosure from it; existing legacy researcher reports are untouched.
   instrumentVersion:runtime.instrumentVersion,audience:'teacher',purpose:'report',frozenPolicy:policy.policy})
  const capabilities=intersectDisclosureCapabilities(resolveEffectiveScaleDisclosure(context),
   resolveEffectiveScaleDisclosure({...context,audience}))
  const metricKeys=new Set(capabilities.numericScores?Object.keys(runtime.compiledRuntime.metricDefinitions):[])
  return {metricKeys,referenceMetricKeys:new Set(capabilities.references&&capabilities.individualInterpretations?metricKeys:[]),capabilities}
 }
 if(unit.family!=='SJT'||source.sourceType!=='SITUATIONAL_ATTEMPT')invalid()
 // SJT retains its existing numeric visibility; the accepted canonical result
 // is the allowed dictionary, not a newly granted scientific audience.
 const metricKeys=new Set(core?.metrics.map(metric=>metric.key)??input.metricKeys??[])
 return {metricKeys,referenceMetricKeys:metricKeys,capabilities:DISCLOSURE_PRESETS.FULL_REPORT()}
}

export function trainingReportDisclosureAllowed(disclosure:TrainingMetricDisclosure,report:{metricKeys:readonly string[];template:ReportTemplate}){
 if(report.metricKeys.some(key=>!disclosure.metricKeys.has(key)))return false
 return report.template.blocks.every(block=>{
  if(block.type==='METRIC')return disclosure.metricKeys.has(block.metricKey)&&(block.display==='RAW'
   ?disclosure.capabilities.numericScores:disclosure.referenceMetricKeys.has(block.metricKey))
  if(block.type==='CHART')return disclosure.capabilities.numericScores&&block.metricKeys.every(key=>disclosure.metricKeys.has(key))
  if(block.type==='REFERENCE_BAND')return disclosure.capabilities.scoreDerivedLabels&&disclosure.referenceMetricKeys.has(block.metricKey)
  return true
 })
}
