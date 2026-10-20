import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { prisma } from '../../config/database'
import { canonicalHash } from '../assessment-runtime/canonical'
import { assertContentAuthority } from '../measurement-content/content-authority.repository'
import { getContentRelease } from '../measurement-content/repository'
import { ContentReleaseError } from '../measurement-content/release'
import { prepareReferenceCandidate, surveyReferenceSourceBindingSchema, referenceEntryKey, type SurveyReferenceSourceBinding, type AuthorizedReferenceFact, type ReferenceCandidate } from '../measurement-content/reference-candidate'
import { storeReferenceCandidate, storeReferenceReview, publishReviewedReferenceCandidate } from '../measurement-content/reference-candidate.repository'
import { authorizedProject } from './builder.service'
import { loadSurveySource, type SurveySourceProjection } from './analytics.source'
import { describeWave } from './analytics.descriptive'
import { SurveyAnalyticsError } from './analytics.errors'

const text=z.string().trim().min(1).max(4000)
const selector=z.string().trim().min(1).max(240)
const requestSchema=z.object({
  projectId:z.string().uuid(),waveId:z.string().uuid(),grantId:z.string().uuid(),
  instrumentKey:selector,scoreKey:selector,referenceVersion:selector,
  evidence:z.object({methodRationale:text,inclusionRule:text,missingness:text,repeatResponses:text,
    organizationClustering:text,administrationDifferences:text,uncertainty:text,applicability:text,sampleAdequacy:text}).strict(),
}).strict()
function fail(code:string):never{throw new ContentReleaseError(code)}

async function readBinding(tx:Prisma.TransactionClient,input:Pick<z.infer<typeof requestSchema>,'projectId'|'waveId'|'instrumentKey'>){
    const bindings=await tx.$queryRaw<Array<{measurement:{releaseId:string;contentHash:string;measurementHash:string}|null;source_revision:number}>>(Prisma.sql`
      SELECT unit->'measurementRelease' AS measurement, project.revision AS source_revision
      FROM survey_waves wave JOIN survey_projects project ON project.id=wave.project_id
      JOIN survey_publications publication ON publication.id=wave.publication_id AND publication.project_id=wave.project_id
      CROSS JOIN LATERAL jsonb_array_elements(publication.compiled_snapshot->'units') unit
      WHERE wave.project_id=${input.projectId} AND wave.id=${input.waveId}
        AND unit->>'instrumentKey'=${input.instrumentKey} LIMIT 2 FOR SHARE OF wave,publication`)
    if(bindings.length!==1||!bindings[0].measurement)fail('REFERENCE_SURVEY_MEASUREMENT_BINDING_REQUIRED')
    return {binding:bindings[0].measurement!,sourceRevision:bindings[0].source_revision}
}

function eligibleScores(source:SurveySourceProjection,selector:{projectId:string;waveId:string;instrumentKey:string;scoreKey:string},family:string){
    const scores=source.scores.filter(s=>s.waveId===selector.waveId&&s.measurement.instrumentKey===selector.instrumentKey&&s.measurement.scoreKey===selector.scoreKey)
    if(scores.some(s=>s.projectId!==selector.projectId||!s.sourceVerified||s.value!==null&&!Number.isFinite(s.value)))fail('REFERENCE_SURVEY_SCORE_INVALID')
    // Mutually exclusive exclusion reasons; never return excluded subject IDs.
    const exclusionCounts={qualityMissing:0,qualityLimited:0,qualityInvalid:0,metricNotCalculated:0,missingValue:0}
    const valid=scores.filter(score=>{
      if(!score.quality){exclusionCounts.qualityMissing++;return false}
      if(score.quality.status==='limited'){exclusionCounts.qualityLimited++;return false}
      if(score.quality.status!=='interpretable'){exclusionCounts.qualityInvalid++;return false}
      if(score.status!==(family==='COGNITIVE'?'OK':'calculated')){exclusionCounts.metricNotCalculated++;return false}
      if(score.missingReason!==null||score.value===null){exclusionCounts.missingValue++;return false}
      return true
    })
    const excludedSummary=Object.entries(exclusionCounts).map(([reason,count])=>`${reason}=${count}`).join(', ')
    if(!valid.length||new Set(valid.map(s=>s.attemptId)).size!==valid.length)fail('REFERENCE_SURVEY_SAMPLE_INVALID')
    return {valid,exclusionCounts,excludedSummary}
}
function currentFacts(valid:ReturnType<typeof eligibleScores>['valid'],candidate:Pick<ReferenceCandidate,'definition'|'measurement'>){
  const entryKey=referenceEntryKey(candidate.definition.entries[0])
  return new Map<string,AuthorizedReferenceFact>(valid.map(score=>[score.attemptId,{
    factVersion:canonicalHash({sourceFinalHash:score.sourceFinalHash,sourceResultHash:score.sourceResultHash??null,epoch:score.epoch??null,
      waveId:score.waveId,instrumentKey:score.measurement.instrumentKey,scoreKey:score.measurement.scoreKey}),
    measurementReleaseId:candidate.measurement.releaseId,metricKeys:[score.measurement.scoreKey],eligibleEntryKeys:[entryKey],
  }]))
}
async function sourceFence(tx:Prisma.TransactionClient,source:SurveyReferenceSourceBinding,measurement:ReferenceCandidate['measurement']){
  const current=await readBinding(tx,source)
  const expected={releaseId:measurement.releaseId,contentHash:measurement.contentHash,measurementHash:measurement.measurementHash}
  if(current.sourceRevision!==source.sourceRevision||canonicalHash(current.binding)!==canonicalHash(expected))fail('REFERENCE_SURVEY_SOURCE_CHANGED')
  const count=await tx.surveyWaveFinal.count({where:{projectId:source.projectId,waveId:source.waveId,completedAt:{lt:new Date(source.cutOff)},
    attempt:{status:'COMPLETED',excludedAt:null,OR:[{sampleReview:{is:null}},{sampleReview:{is:{verdict:'INCLUDED'}}}]}}})
  if(count!==source.sourceFinalCount)fail('REFERENCE_SURVEY_SOURCE_CHANGED')
}

/** Internal creation only: no route, root-grant issuer, external norm JSON or data
 * access grant. actorId must come from authenticated Survey identity. Two short
 * transactions bracket the existing bounded reader (no nested pool reservation).
 * sample-quality and both withdrawal services lock project FOR UPDATE first;
 * the final shared lock and revision check serialize the candidate write with them.
 * The reader's own pre/post material fences remain intact. An explicit manifest
 * freezes included facts, rather than claiming a census of uncommitted FINALs.
 */
export async function createSurveyReferenceCandidate(actorId:string,raw:unknown){
  const input=requestSchema.parse(raw)
  const {binding,sourceRevision,authority,measurement}=await prisma.$transaction(async tx=>{
    await authorizedProject(tx,actorId,input.projectId,false)
    // Obtain only the persisted binding before accessing samples. The reader
    // later verifies publication digests and must return this exact identity.
    const {binding,sourceRevision}=await readBinding(tx,input)
    const authority={actorId,grantId:input.grantId,capability:'reference.analyze' as const,
      scope:{product:'SURVEY' as const,scopeKind:'PROJECT' as const,scopeId:input.projectId,
        resourceKind:'reference' as const,resourceKeys:[binding.releaseId]}}
    await assertContentAuthority(tx,authority)
    const measurement=await getContentRelease(tx,binding.releaseId,true)
    if(!measurement||measurement.layer!=='MEASUREMENT'||measurement.status==='REVOKED'
      ||measurement.scope.kind!=='PRIVATE'||measurement.scope.product!=='SURVEY'
      ||measurement.scope.resourceId!==input.projectId||measurement.scope.ownerId!==actorId
      ||measurement.provenance.source||measurement.contentHash!==binding.contentHash
      ||measurement.content.measurementHash!==binding.measurementHash
      ||!measurement.content.metrics.some(metric=>metric.metricKey===input.scoreKey))fail('REFERENCE_SURVEY_MEASUREMENT_MISMATCH')
    return {binding,sourceRevision,authority,measurement}
  },{isolationLevel:Prisma.TransactionIsolationLevel.ReadCommitted})
    const source=await loadSurveySource({actorUserId:actorId,projectId:input.projectId,waveIds:[input.waveId],
      maxFinals:250,pageMode:true,stableIdCursor:true,selectRaw:false,
      selectScore:{instrumentKey:input.instrumentKey,scoreKey:input.scoreKey},includeAttendance:false,
      expectedSourceRevision:sourceRevision})
    if(source.nextFinalCursor)throw new SurveyAnalyticsError(413,'参考候选最多使用 250 份 FINAL，请缩小波次范围')
    if(source.projectId!==input.projectId||source.sourceRevision!==sourceRevision
      ||!Number.isSafeInteger(source.sourceFinalCount)||source.sourceFinalCount!<0)fail('REFERENCE_SURVEY_SOURCE_CHANGED')
    const versions=source.sourceVersions?.filter(v=>v.waveId===input.waveId&&v.instrumentKey===input.instrumentKey)??[]
    if(versions.length!==1||canonicalHash(versions[0].measurementRelease??null)!==canonicalHash(binding))
      fail('REFERENCE_SURVEY_MEASUREMENT_MISMATCH')
    const {valid,exclusionCounts,excludedSummary}=eligibleScores(source,input,measurement.family)
    // Existing stats and variant rejection; never recompute scores or interpret raw answers.
    const summaries=describeWave({...source,scores:valid},input.waveId).descriptiveScores.filter(s=>s.instrumentKey===input.instrumentKey&&s.scoreKey===input.scoreKey)
    if(summaries.length!==1||summaries[0].validN!==valid.length||!Number.isFinite(summaries[0].mean))fail('REFERENCE_SURVEY_STATISTICS_INVALID')
    const summary=summaries[0]
    if(summary.sampleSd!==null&&!Number.isFinite(summary.sampleSd))fail('REFERENCE_SURVEY_STATISTICS_INVALID')
    const candidate:Omit<ReferenceCandidate,'schemaVersion'|'candidateHash'>={
      analyzerId:actorId,scope:measurement.scope,
      measurement:{releaseId:measurement.releaseId,contentHash:measurement.contentHash,instrumentVersion:measurement.content.instrumentVersion,
        scoringVersion:measurement.content.scoringVersion,measurementHash:measurement.content.measurementHash},
      sourceBinding:{kind:'SURVEY_VERIFIED_SOURCE_V1',projectId:input.projectId,waveId:input.waveId,
        instrumentKey:input.instrumentKey,scoreKey:input.scoreKey,sourceRevision:source.sourceRevision,
        sourceFinalCount:source.sourceFinalCount!,cutOff:source.cutOff},
      definition:{schemaVersion:1,instrumentType:({SCALE:'scale',COGNITIVE:'cognitive',SJT:'sjt'} as const)[measurement.family],
        instrumentKey:input.instrumentKey,referenceVersion:input.referenceVersion,status:'DRAFT',entries:[{
          scoreKey:input.scoreKey,referenceKind:'descriptive_sample',evidenceLevel:'local_pilot',provenanceType:'local_observed',
          instrumentVersion:measurement.content.instrumentVersion,scoringVersion:measurement.content.scoringVersion,
          population:{description:'本项目本波次符合纳入规则的样本；无已核验人口分组，不代表一般人群常模'},
          source:{citation:'Verified internal Survey FINAL descriptive sample',sampleSize:valid.length},
          statistics:{mean:summary.mean!,...(valid.length>1&&summary.sampleSd!==null&&summary.sampleSd>0?{sd:summary.sampleSd}:{})},
          limitations:['仅作项目样本描述；未建立跨入口常模。',`互斥排除计数：${excludedSummary}。`,
            ...(summary.sampleSd===null?['样本不足，无法估计样本标准差。']:summary.sampleSd===0?['样本无变异，不提供标准差转换。']:[])],
        }]},sampleManifest:[],
      evidence:{source:'INTERNAL_OBSERVED',cutoff:source.cutOff,softwareVersion:'SURVEY_DESCRIPTIVE_V1',
        method:'describeWave arithmetic mean; sample SD (N-1) only when estimable and positive. Rationale: '+input.evidence.methodRationale,
        inclusionRule:'Server policy: interpretable quality and calculated metric (cognitive: OK); nonmissing finite value. Additional evidence: '+input.evidence.inclusionRule,missingness:input.evidence.missingness,repeatResponses:input.evidence.repeatResponses,
        organizationClustering:input.evidence.organizationClustering,administrationDifferences:input.evidence.administrationDifferences,
        uncertainty:input.evidence.uncertainty,applicability:input.evidence.applicability,sampleAdequacy:input.evidence.sampleAdequacy},
    }
    const authorizedFacts=currentFacts(valid,candidate)
    candidate.sampleManifest=[...authorizedFacts].map(([factId,fact])=>({factId,factVersion:fact.factVersion,
      measurementReleaseId:fact.measurementReleaseId,metricKeys:[...fact.metricKeys],entryKeys:[...fact.eligibleEntryKeys]}))
    // Lock current owner/project and capabilities through commit; a withdrawal
    // or quality change since the reader returned must fail this revision fence.
    return prisma.$transaction(async tx=>{
    await authorizedProject(tx,actorId,input.projectId,false)
    await assertContentAuthority(tx,authority)
    await sourceFence(tx,candidate.sourceBinding!,candidate.measurement)
    return {...await storeReferenceCandidate(tx,candidate,authorizedFacts),exclusionCounts}
  },{isolationLevel:Prisma.TransactionIsolationLevel.ReadCommitted,maxWait:5000,timeout:5000})
}

const candidateActionSchema=z.object({candidateId:z.string().uuid(),grantId:z.string().uuid()}).strict()
const reviewSchema=candidateActionSchema.extend({decision:z.enum(['APPROVED','REJECTED']),statement:text}).strict()
const publishSchema=candidateActionSchema.extend({reviewId:z.string().uuid(),localKey:z.string().trim().min(1).max(165),version:selector}).strict()

async function readCandidate(tx:Prisma.TransactionClient,id:string){
  const rows=await tx.$queryRaw<Array<{payload:ReferenceCandidate}>>(Prisma.sql`
    SELECT payload FROM measurement_reference_candidates WHERE id=${id} FOR SHARE`)
  if(!rows[0])fail('REFERENCE_CANDIDATE_NOT_FOUND')
  const candidate=rows[0].payload,source=surveyReferenceSourceBindingSchema.safeParse(candidate.sourceBinding)
  if(!source.success||candidate.scope.kind!=='PRIVATE'||candidate.scope.product!=='SURVEY'
    ||candidate.scope.resourceId!==source.data.projectId||candidate.evidence.source!=='INTERNAL_OBSERVED'
    ||candidate.evidence.softwareVersion!=='SURVEY_DESCRIPTIVE_V1'||candidate.definition.entries.length!==1
    ||candidate.definition.entries.some(entry=>entry.referenceKind!=='descriptive_sample'||entry.evidenceLevel!=='local_pilot'
      ||entry.provenanceType!=='local_observed'||entry.population.match!==undefined))fail('REFERENCE_SURVEY_CANDIDATE_REQUIRED')
  const {candidateHash,...payload}=candidate
  if(canonicalHash(payload)!==candidateHash)fail('REFERENCE_REVIEW_STALE')
  return {candidate,source:source.data}
}

async function authorizeCandidate(tx:Prisma.TransactionClient,actorId:string,grantId:string,
  capability:'reference.review'|'reference.publish',candidate:ReferenceCandidate,source:SurveyReferenceSourceBinding){
  await authorizedProject(tx,actorId,source.projectId,false)
  if(candidate.scope.kind!=='PRIVATE'||candidate.scope.ownerId!==actorId)fail('REFERENCE_SURVEY_CANDIDATE_REQUIRED')
  await assertContentAuthority(tx,{actorId,grantId,capability,scope:{product:'SURVEY',scopeKind:'PROJECT',scopeId:source.projectId,
    resourceKind:'reference',resourceKeys:[candidate.measurement.releaseId]}})
  const measurement=await getContentRelease(tx,candidate.measurement.releaseId,true)
  if(!measurement||measurement.layer!=='MEASUREMENT'||measurement.status==='REVOKED'||measurement.provenance.source
    ||canonicalHash(measurement.scope)!==canonicalHash(candidate.scope)
    ||canonicalHash({releaseId:measurement.releaseId,contentHash:measurement.contentHash,instrumentVersion:measurement.content.instrumentVersion,
      scoringVersion:measurement.content.scoringVersion,measurementHash:measurement.content.measurementHash})!==canonicalHash(candidate.measurement)
    ||({SCALE:'scale',COGNITIVE:'cognitive',SJT:'sjt'} as const)[measurement.family]!==candidate.definition.instrumentType
    ||!measurement.content.metrics.some(metric=>metric.metricKey===source.scoreKey))fail('REFERENCE_SURVEY_MEASUREMENT_MISMATCH')
  await sourceFence(tx,source,candidate.measurement)
  return measurement.family
}

async function withVerifiedCandidate<T>(actorId:string,input:z.infer<typeof candidateActionSchema>,capability:'reference.review'|'reference.publish',
  write:(tx:Prisma.TransactionClient,candidate:ReferenceCandidate,facts:Map<string,AuthorizedReferenceFact>)=>Promise<T>){
  const initial=await prisma.$transaction(async tx=>{
    const saved=await readCandidate(tx,input.candidateId)
    const family=await authorizeCandidate(tx,actorId,input.grantId,capability,saved.candidate,saved.source)
    return {...saved,family}
  },{isolationLevel:Prisma.TransactionIsolationLevel.ReadCommitted})
  const binding=initial.source
  const source=await loadSurveySource({actorUserId:actorId,projectId:binding.projectId,waveIds:[binding.waveId],maxFinals:250,
    pageMode:true,stableIdCursor:true,selectRaw:false,selectScore:{instrumentKey:binding.instrumentKey,scoreKey:binding.scoreKey},includeAttendance:false,
    expectedSourceRevision:binding.sourceRevision,snapshotCutOff:new Date(binding.cutOff),expectedFinalCount:binding.sourceFinalCount})
  if(source.nextFinalCursor||source.projectId!==binding.projectId||source.sourceRevision!==binding.sourceRevision
    ||source.sourceFinalCount!==binding.sourceFinalCount||source.cutOff!==binding.cutOff)fail('REFERENCE_SURVEY_SOURCE_CHANGED')
  const versions=source.sourceVersions?.filter(version=>version.waveId===binding.waveId&&version.instrumentKey===binding.instrumentKey)??[]
  const expected={releaseId:initial.candidate.measurement.releaseId,contentHash:initial.candidate.measurement.contentHash,
    measurementHash:initial.candidate.measurement.measurementHash}
  if(versions.length!==1||canonicalHash(versions[0].measurementRelease??null)!==canonicalHash(expected))fail('REFERENCE_SURVEY_MEASUREMENT_MISMATCH')
  const {valid}=eligibleScores(source,binding,initial.family),facts=currentFacts(valid,initial.candidate)
  const {candidateHash,schemaVersion:_schema,...payload}=initial.candidate
  if(prepareReferenceCandidate(payload,facts).candidateHash!==candidateHash||facts.size!==initial.candidate.sampleManifest.length)
    fail('REFERENCE_REVIEW_STALE')
  return prisma.$transaction(async tx=>{
    const current=await readCandidate(tx,input.candidateId)
    if(current.candidate.candidateHash!==candidateHash)fail('REFERENCE_REVIEW_STALE')
    await authorizeCandidate(tx,actorId,input.grantId,capability,current.candidate,current.source)
    return write(tx,current.candidate,facts)
  },{isolationLevel:Prisma.TransactionIsolationLevel.ReadCommitted,maxWait:5000,timeout:5000})
}

/** Private descriptive review only. Same-user review still requires its own current review capability. */
export async function reviewSurveyReferenceCandidate(actorId:string,raw:unknown){
  const input=reviewSchema.parse(raw)
  return withVerifiedCandidate(actorId,input,'reference.review',async(tx,candidate)=>({reviewId:await storeReferenceReview(tx,input.candidateId,{
    candidateHash:candidate.candidateHash,reviewerId:actorId,decision:input.decision,statement:input.statement,reviewedAt:new Date().toISOString(),
  })}))
}
/** Existing immutable candidate/review records are revalidated; caller cannot supply an approval or purpose. */
export async function publishSurveyReferenceCandidate(actorId:string,raw:unknown){
  const input=publishSchema.parse(raw)
  return withVerifiedCandidate(actorId,input,'reference.publish',(tx,_candidate,facts)=>publishReviewedReferenceCandidate(tx,{
    candidateId:input.candidateId,reviewId:input.reviewId,localKey:input.localKey,version:input.version,actorId,purpose:'HISTORICAL_INTERPRETATION',
  },facts))
}
