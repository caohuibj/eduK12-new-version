import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { prisma } from '../../config/database'
import { canonicalHash } from '../assessment-runtime/canonical'
import { assertContentAuthority } from '../measurement-content/content-authority.repository'
import { getContentRelease } from '../measurement-content/repository'
import { ContentReleaseError } from '../measurement-content/release'
import { referenceEntryKey, type AuthorizedReferenceFact, type ReferenceCandidate } from '../measurement-content/reference-candidate'
import { storeReferenceCandidate } from '../measurement-content/reference-candidate.repository'
import { authorizedProject } from './builder.service'
import { loadSurveySource } from './analytics.source'
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
    const scores=source.scores.filter(s=>s.waveId===input.waveId&&s.measurement.instrumentKey===input.instrumentKey&&s.measurement.scoreKey===input.scoreKey)
    if(scores.some(s=>s.projectId!==input.projectId||!s.sourceVerified||s.value!==null&&!Number.isFinite(s.value)))fail('REFERENCE_SURVEY_SCORE_INVALID')
    // Mutually exclusive exclusion reasons; never return excluded subject IDs.
    const exclusionCounts={qualityMissing:0,qualityLimited:0,qualityInvalid:0,metricNotCalculated:0,missingValue:0}
    const valid=scores.filter(score=>{
      if(!score.quality){exclusionCounts.qualityMissing++;return false}
      if(score.quality.status==='limited'){exclusionCounts.qualityLimited++;return false}
      if(score.quality.status!=='interpretable'){exclusionCounts.qualityInvalid++;return false}
      if(score.status!==(measurement.family==='COGNITIVE'?'OK':'calculated')){exclusionCounts.metricNotCalculated++;return false}
      if(score.missingReason!==null||score.value===null){exclusionCounts.missingValue++;return false}
      return true
    })
    const excludedSummary=Object.entries(exclusionCounts).map(([reason,count])=>`${reason}=${count}`).join(', ')
    if(!valid.length||new Set(valid.map(s=>s.attemptId)).size!==valid.length)fail('REFERENCE_SURVEY_SAMPLE_INVALID')
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
    const entryKey=referenceEntryKey(candidate.definition.entries[0]),authorizedFacts=new Map<string,AuthorizedReferenceFact>()
    for(const score of valid){
      const factVersion=canonicalHash({sourceFinalHash:score.sourceFinalHash,sourceResultHash:score.sourceResultHash??null,epoch:score.epoch??null,
        waveId:score.waveId,instrumentKey:score.measurement.instrumentKey,scoreKey:score.measurement.scoreKey})
      const member={factId:score.attemptId,factVersion,measurementReleaseId:measurement.releaseId,metricKeys:[input.scoreKey],entryKeys:[entryKey]}
      candidate.sampleManifest.push(member)
      authorizedFacts.set(member.factId,{factVersion,measurementReleaseId:measurement.releaseId,metricKeys:member.metricKeys,eligibleEntryKeys:member.entryKeys})
    }
    // Lock current owner/project and capabilities through commit; a withdrawal
    // or quality change since the reader returned must fail this revision fence.
    return prisma.$transaction(async tx=>{
    await authorizedProject(tx,actorId,input.projectId,false)
    await assertContentAuthority(tx,authority)
    const currentBinding=await readBinding(tx,input)
    if(currentBinding.sourceRevision!==source.sourceRevision||canonicalHash(currentBinding.binding)!==canonicalHash(binding))fail('REFERENCE_SURVEY_SOURCE_CHANGED')
    const count=await tx.surveyWaveFinal.count({where:{projectId:input.projectId,waveId:input.waveId,completedAt:{lt:new Date(source.cutOff)},
      attempt:{status:'COMPLETED',excludedAt:null,OR:[{sampleReview:{is:null}},{sampleReview:{is:{verdict:'INCLUDED'}}}]}}})
    if(count!==source.sourceFinalCount)fail('REFERENCE_SURVEY_SOURCE_CHANGED')
    return {...await storeReferenceCandidate(tx,candidate,authorizedFacts),exclusionCounts}
  },{isolationLevel:Prisma.TransactionIsolationLevel.ReadCommitted,maxWait:5000,timeout:5000})
}
