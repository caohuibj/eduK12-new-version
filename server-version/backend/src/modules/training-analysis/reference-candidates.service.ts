import {Prisma} from '@prisma/client'
import {z} from 'zod'
import {prisma} from '../../config/database'
import {canonicalHash} from '../assessment-runtime/canonical'
import {reportingAggregations} from '../reporting/statistics'
import {ContentReleaseError} from '../measurement-content/release'
import {getContentRelease} from '../measurement-content/repository'
import {prepareReferenceCandidate,referenceEntryKey,trainingReferenceSourceBindingSchema,type ReferenceCandidate,type AuthorizedReferenceFact} from '../measurement-content/reference-candidate'
import {storeReferenceCandidate,storeReferenceReview,publishReviewedReferenceCandidate} from '../measurement-content/reference-candidate.repository'
import {assertTrainingReferenceAuthority,readTrainingReferenceSource,trainingReferenceSelectorSchema,type TrainingReferenceContext} from './reference-source'

const uuid=z.string().uuid(),text=z.string().trim().min(1).max(4000),selector=z.string().trim().min(1).max(200),digest=z.string().regex(/^[a-f0-9]{64}$/)
export const trainingReferenceCreateSchema=z.object({requestId:uuid,selector:trainingReferenceSelectorSchema,referenceVersion:selector,
 evidence:z.object({methodRationale:text,inclusionRule:text,missingness:text,repeatResponses:text,organizationClustering:text,
  administrationDifferences:text,uncertainty:text,applicability:text,sampleAdequacy:text}).strict()}).strict()
export const trainingReferenceReadSchema=z.object({candidateId:uuid}).strict()
export const trainingReferenceReviewSchema=trainingReferenceReadSchema.extend({requestId:uuid,candidateHash:digest,decision:z.enum(['APPROVED','REJECTED']),statement:text}).strict()
export const trainingReferencePublishSchema=trainingReferenceReadSchema.extend({requestId:uuid,reviewId:uuid,localKey:selector.max(165),version:selector}).strict()
type Operation='CREATE'|'REVIEW'|'PUBLISH'
const capability={CREATE:'reference.analyze',REVIEW:'reference.review',PUBLISH:'reference.publish'} as const
const schemas={CREATE:trainingReferenceCreateSchema,REVIEW:trainingReferenceReviewSchema,PUBLISH:trainingReferencePublishSchema}
const options={isolationLevel:Prisma.TransactionIsolationLevel.ReadCommitted,maxWait:5000,timeout:15000}
function fail(code:string):never{throw new ContentReleaseError(code)}
type RequestRow={request_id:string;actor_id:string;course_id:string;composite_id:string;operation:Operation;input_hash:string;
 candidate_id:string;review_id:string|null;release_id:string|null;exclusion_counts:Record<string,number>|null}
export async function readTrainingReferenceCandidateRecord(tx:Prisma.TransactionClient,context:Pick<TrainingReferenceContext,'actorId'|'courseId'|'compositeId'>,candidateId:string){
 const [row]=await tx.$queryRaw<Array<{payload:ReferenceCandidate}>>(Prisma.sql`SELECT payload FROM measurement_reference_candidates WHERE id=${candidateId} FOR SHARE`)
 if(!row)fail('REFERENCE_CANDIDATE_NOT_FOUND')
 const candidate=row.payload,source=trainingReferenceSourceBindingSchema.safeParse(candidate.sourceBinding),{candidateHash,...payload}=candidate
 if(!source.success||candidate.scope.kind!=='PRIVATE'||candidate.scope.product!=='TRAINING'||candidate.scope.ownerId!==context.actorId
  ||candidate.scope.resourceId!==context.compositeId||source.data.courseId!==context.courseId||source.data.compositeId!==context.compositeId
  ||candidate.analyzerId!==context.actorId||candidate.evidence.source!=='INTERNAL_OBSERVED'||candidate.evidence.softwareVersion!=='TRAINING_DESCRIPTIVE_V1'
  ||candidate.definition.entries.length!==1||candidate.definition.entries.some(entry=>entry.referenceKind!=='descriptive_sample'||entry.evidenceLevel!=='local_pilot'
   ||entry.provenanceType!=='local_observed'||entry.population.match!==undefined)||canonicalHash(payload)!==candidateHash)fail('REFERENCE_TRAINING_CANDIDATE_REQUIRED')
 return {candidate,source:source.data}
}
/** Never send sample IDs, participant keys, or raw numeric observations. */
export function trainingReferenceCandidateView(candidate:ReferenceCandidate){
 const source=trainingReferenceSourceBindingSchema.parse(candidate.sourceBinding)
 return {candidateHash:candidate.candidateHash,measurement:candidate.measurement,definition:candidate.definition,evidence:candidate.evidence,
  sampleSize:candidate.sampleManifest.length,source:{kind:source.kind,courseId:source.courseId,compositeId:source.compositeId,selector:source.selector,
   cutOff:source.cutOff,sourceHash:source.sourceHash,sourceCount:source.sourceIds.length}}
}
function factsFor(source:Awaited<ReturnType<typeof readTrainingReferenceSource>>,candidate:Pick<ReferenceCandidate,'definition'>){
 const entry=referenceEntryKey(candidate.definition.entries[0])
 return new Map<string,AuthorizedReferenceFact>(source.eligible.map(row=>[row.factId,{factVersion:row.factVersion,
  measurementReleaseId:row.measurementReleaseId,metricKeys:[source.binding.selector.scoreKey],eligibleEntryKeys:[entry]}]))
}
/** Internal verifier. Caller first authorizes its operation or validates an
 * explicit persisted source-owner formal submission; never a body-supplied actor. */
export async function verifyTrainingReferenceCandidate(tx:Prisma.TransactionClient,context:TrainingReferenceContext,candidate:ReferenceCandidate){
 const binding=trainingReferenceSourceBindingSchema.parse(candidate.sourceBinding)
 const source=await readTrainingReferenceSource(tx,context,binding.selector,binding),facts=factsFor(source,candidate)
 const {candidateHash,schemaVersion:_schema,...payload}=candidate
 if(prepareReferenceCandidate(payload,facts).candidateHash!==candidateHash||facts.size!==candidate.sampleManifest.length)fail('REFERENCE_TRAINING_SOURCE_CHANGED')
 return {facts,source}
}
async function resultFor(tx:Prisma.TransactionClient,context:TrainingReferenceContext,row:RequestRow){
 const {candidate}=await readTrainingReferenceCandidateRecord(tx,context,row.candidate_id)
 const measurement=await getContentRelease(tx,candidate.measurement.releaseId,true)
 if(!measurement||measurement.layer!=='MEASUREMENT'||measurement.status==='REVOKED'||measurement.contentHash!==candidate.measurement.contentHash)fail('REFERENCE_TRAINING_MEASUREMENT_MISMATCH')
 if(row.operation==='CREATE'){
  // Recovery exposes the original aggregate, not a capability to bypass a later
  // withdrawal or quality/source fence. Revalidate frozen membership without
  // recomputing statistics or replacing the immutable candidate.
  await verifyTrainingReferenceCandidate(tx,context,candidate)
  return {candidateId:row.candidate_id,...trainingReferenceCandidateView(candidate),exclusionCounts:row.exclusion_counts}
 }
 if(row.operation==='REVIEW')return {reviewId:row.review_id!}
 const release=row.release_id?await getContentRelease(tx,row.release_id,true):null
 if(!release||release.layer!=='REFERENCE'||release.provenance.candidateId!==row.candidate_id||release.provenance.reviewId!==row.review_id)fail('REFERENCE_REQUEST_RESULT_INVALID')
 return {releaseId:release.releaseId,contentHash:release.contentHash,version:release.version,status:release.status}
}
async function recover(tx:Prisma.TransactionClient,context:TrainingReferenceContext,operation:Operation,input:{requestId:string}){
 const [row]=await tx.$queryRaw<RequestRow[]>(Prisma.sql`SELECT * FROM training_reference_requests WHERE request_id=${input.requestId}::uuid`)
 if(!row)return null
 if(row.actor_id!==context.actorId||row.course_id!==context.courseId||row.composite_id!==context.compositeId||row.operation!==operation
  ||row.input_hash!==canonicalHash({context,operation,input}))fail('REFERENCE_REQUEST_INPUT_MISMATCH')
 return resultFor(tx,context,row)
}
async function storeRequest(tx:Prisma.TransactionClient,context:TrainingReferenceContext,operation:Operation,input:{requestId:string},
 result:{candidateId:string;reviewId?:string;releaseId?:string;exclusionCounts?:Record<string,number>}){
 await tx.$executeRaw(Prisma.sql`INSERT INTO training_reference_requests
  (request_id,actor_id,course_id,composite_id,operation,input_hash,candidate_id,review_id,release_id,exclusion_counts)
  VALUES(${input.requestId}::uuid,${context.actorId},${context.courseId},${context.compositeId},${operation},${canonicalHash({context,operation,input})},
   ${result.candidateId},${result.reviewId??null},${result.releaseId??null},${result.exclusionCounts?JSON.stringify(result.exclusionCounts):null}::jsonb)`)
}
async function run<T>(context:TrainingReferenceContext,operation:Operation,input:{requestId:string},write:(tx:Prisma.TransactionClient)=>Promise<T>){
 return prisma.$transaction(async tx=>{
  await assertTrainingReferenceAuthority(tx,context,capability[operation])
  await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${input.requestId},71026))`)
  const replay=await recover(tx,context,operation,input)
  if(replay){await assertTrainingReferenceAuthority(tx,context,capability[operation]);return replay}
  const result=await write(tx)
  await assertTrainingReferenceAuthority(tx,context,capability[operation])
  return result
 },options)
}
export async function createTrainingReferenceCandidate(context:TrainingReferenceContext,raw:unknown){
 const input=trainingReferenceCreateSchema.parse(raw)
 return run(context,'CREATE',input,async tx=>{
  const source=await readTrainingReferenceSource(tx,context,input.selector),measurement=source.measurement
  const statistics=reportingAggregations({values:source.eligible.map(row=>row.value),aggregations:['MEAN','SD_SAMPLE'],distributionCellFloor:5})
  if(typeof statistics.mean!=='number'||!Number.isFinite(statistics.mean))fail('REFERENCE_TRAINING_STATISTICS_INVALID')
  const candidate:Omit<ReferenceCandidate,'candidateHash'|'schemaVersion'>={analyzerId:context.actorId,
   scope:{kind:'PRIVATE',product:'TRAINING',ownerId:context.actorId,resourceId:context.compositeId},sourceBinding:source.binding,
   measurement:{releaseId:measurement.releaseId,contentHash:measurement.contentHash,measurementHash:measurement.content.measurementHash,
    instrumentVersion:measurement.content.instrumentVersion,scoringVersion:measurement.content.scoringVersion},
   definition:{schemaVersion:1,instrumentType:({SCALE:'scale',COGNITIVE:'cognitive',SJT:'sjt'} as const)[measurement.family],
    instrumentKey:source.instrumentKey,referenceVersion:input.referenceVersion,status:'DRAFT',entries:[{scoreKey:input.selector.scoreKey,
     referenceKind:'descriptive_sample',evidenceLevel:'local_pilot',provenanceType:'local_observed',instrumentVersion:measurement.content.instrumentVersion,
     scoringVersion:measurement.content.scoringVersion,population:{description:'本课程、精确投放与测量版本中符合纳入条件的样本；无已核验人口分组，不代表一般人群常模'},
     source:{citation:'Verified internal Training FINAL descriptive sample',sampleSize:source.eligible.length},
     statistics:{mean:statistics.mean,...(typeof statistics.sdSample==='number'&&statistics.sdSample>0?{sd:statistics.sdSample}:{})},
     limitations:['仅作课程样本描述；未建立跨入口常模。','同一参与者重复作答须先明确样本，不自动选择最新或最佳结果。',
      ...(statistics.sdSample===0?['样本无变异，不提供标准差转换。']:[])]}]},sampleManifest:[],
   evidence:{source:'INTERNAL_OBSERVED',cutoff:source.binding.cutOff,softwareVersion:'TRAINING_DESCRIPTIVE_V1',
    method:'Existing reportingAggregations arithmetic mean and sample SD (N-1), positive SD only. Rationale: '+input.evidence.methodRationale,
    inclusionRule:'Server policy: completed unified FINAL, exact measurement binding, interpretable quality, eligible research consent, current quality inclusion, finite numeric metric, distinct participant. Additional evidence: '+input.evidence.inclusionRule,
    missingness:input.evidence.missingness,repeatResponses:input.evidence.repeatResponses,organizationClustering:input.evidence.organizationClustering,
    administrationDifferences:input.evidence.administrationDifferences,uncertainty:input.evidence.uncertainty,applicability:input.evidence.applicability,sampleAdequacy:input.evidence.sampleAdequacy}}
  const facts=factsFor(source,candidate)
  candidate.sampleManifest=[...facts].map(([factId,fact])=>({factId,factVersion:fact.factVersion,measurementReleaseId:fact.measurementReleaseId,
   metricKeys:[...fact.metricKeys],entryKeys:[...fact.eligibleEntryKeys]}))
  const stored=await storeReferenceCandidate(tx,candidate,facts)
  await storeRequest(tx,context,'CREATE',input,{candidateId:stored.candidateId,exclusionCounts:source.exclusionCounts})
  return {candidateId:stored.candidateId,...trainingReferenceCandidateView(stored.candidate),exclusionCounts:source.exclusionCounts}
 })
}
export async function readTrainingReferenceCandidate(context:TrainingReferenceContext,raw:unknown){
 const input=trainingReferenceReadSchema.parse(raw)
 return prisma.$transaction(async tx=>{await assertTrainingReferenceAuthority(tx,context,'reference.review')
  const {candidate}=await readTrainingReferenceCandidateRecord(tx,context,input.candidateId)
  const verified=await verifyTrainingReferenceCandidate(tx,context,candidate)
  await assertTrainingReferenceAuthority(tx,context,'reference.review')
  return {candidateId:input.candidateId,...trainingReferenceCandidateView(candidate),exclusionCounts:verified.source.exclusionCounts}
 },options)
}
export async function reviewTrainingReferenceCandidate(context:TrainingReferenceContext,raw:unknown){
 const input=trainingReferenceReviewSchema.parse(raw)
 return run(context,'REVIEW',input,async tx=>{
  const {candidate}=await readTrainingReferenceCandidateRecord(tx,context,input.candidateId)
  if(candidate.candidateHash!==input.candidateHash)fail('REFERENCE_REVIEW_STALE')
  await verifyTrainingReferenceCandidate(tx,context,candidate)
  const reviewId=await storeReferenceReview(tx,input.candidateId,{candidateHash:candidate.candidateHash,reviewerId:context.actorId,
   decision:input.decision,statement:input.statement,reviewedAt:new Date().toISOString()})
  await storeRequest(tx,context,'REVIEW',input,{candidateId:input.candidateId,reviewId})
  return {reviewId}
 })
}
export async function publishTrainingReferenceCandidate(context:TrainingReferenceContext,raw:unknown){
 const input=trainingReferencePublishSchema.parse(raw)
 return run(context,'PUBLISH',input,async tx=>{
  const {candidate}=await readTrainingReferenceCandidateRecord(tx,context,input.candidateId)
  const {facts}=await verifyTrainingReferenceCandidate(tx,context,candidate)
  const release=await publishReviewedReferenceCandidate(tx,{candidateId:input.candidateId,reviewId:input.reviewId,actorId:context.actorId,
   localKey:input.localKey,version:input.version,purpose:'HISTORICAL_INTERPRETATION'},facts)
  await storeRequest(tx,context,'PUBLISH',input,{candidateId:input.candidateId,reviewId:input.reviewId,releaseId:release.releaseId})
  return {releaseId:release.releaseId,contentHash:release.contentHash,version:release.version,status:release.status}
 })
}
/** Lost-response recovery requires the exact original body and current grant. */
export async function readTrainingReferenceRequest(context:TrainingReferenceContext,operation:Operation,raw:unknown){
 const input=schemas[operation].parse(raw)
 return prisma.$transaction(async tx=>{
  await assertTrainingReferenceAuthority(tx,context,capability[operation])
  const result=await recover(tx,context,operation,input)
  await assertTrainingReferenceAuthority(tx,context,capability[operation])
  return result?{status:'COMPLETED' as const,requestId:input.requestId,result}:{status:'MISSING' as const,requestId:input.requestId}
 },options)
}
