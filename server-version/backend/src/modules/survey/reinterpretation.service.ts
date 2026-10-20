import {Prisma} from '@prisma/client'
import {z} from 'zod'
import {prisma} from '../../config/database'
import {canonicalHash} from '../assessment-runtime/canonical'
import {encryptUnifiedRuntimePayload,decryptUnifiedRuntimePayload} from '../assessment-runtime/security'
import {assertContentAuthority} from '../measurement-content/content-authority.repository'
import {getContentRelease,type StoredRelease} from '../measurement-content/repository'
import {referenceEntryKey} from '../measurement-content/reference-candidate'
import {selectFrozenReferencePolicy,type FrozenReferencePolicy,type VerifiedReferenceForSelection} from '../measurement-content/reference-policy'
import type {AssessmentReferenceEntry} from '../assessment-reference/reference'
import {renderDeclaredReport,DECLARATIVE_REPORT_GENERATOR} from '../measurement-content/report-renderer'
import {authorizedProject} from './builder.service'
import {loadSurveySource,type SurveySourceProjection} from './analytics.source'
import {surveyAttemptContentBindingSchema,type SurveyAttemptContentBinding} from './content-binding.service'
import {checkedStoredSurveyInterpretation} from './analytics.interpretation-export'
import {interpretSurveyContentBinding,type SurveyInterpretationFacts,type SurveyFinalInterpretation} from './final-interpretation.service'
import {SurveyAnalyticsError} from './analytics.errors'
const id=z.string().uuid(),hash=z.string().regex(/^[a-f0-9]{64}$/)
export const surveyReinterpretationRequestSchema=z.object({requestId:id,projectId:id,waveId:id,finalId:id,grantId:id,
  instrumentKey:z.string().regex(/^[a-z][a-z0-9_-]{0,79}$/),reportReleaseId:id.optional(),
  references:z.array(z.object({releaseId:id,entryKey:hash,priority:z.number().int().safe()}).strict()).max(100),
}).strict().refine(input=>Boolean(input.reportReleaseId)||input.references.length>0,'Select a report or reference explicitly')
type Request=z.infer<typeof surveyReinterpretationRequestSchema>
interface Artifact {
  schemaVersion:1;sourceFinalHash:string;sourceBindingHash:string;binding:SurveyAttemptContentBinding;
  referencePolicy:FrozenReferencePolicy;interpretation:SurveyFinalInterpretation;report:ReturnType<typeof renderDeclaredReport>|null;
  generatorVersion:typeof DECLARATIVE_REPORT_GENERATOR
}
type Row={id:string;final_id:string;created_by:string;request_hash:string;source_final_hash:string;artifact_cipher:string;artifact_hash:string;created_at:Date}
const fail=(message:string):never=>{throw new SurveyAnalyticsError(409,message)}
const txOptions={isolationLevel:Prisma.TransactionIsolationLevel.ReadCommitted,maxWait:5000,timeout:5000}
async function authority(tx:Prisma.TransactionClient,actorId:string,input:Request){
  await authorizedProject(tx,actorId,input.projectId,false)
  await assertContentAuthority(tx,{actorId,grantId:input.grantId,capability:'data.reinterpret',scope:{product:'SURVEY',scopeKind:'PROJECT',
    scopeId:input.projectId,resourceKind:'data',resourceKeys:[input.finalId]}})
}
async function fence(tx:Prisma.TransactionClient,input:Pick<Request,'projectId'|'waveId'|'finalId'>,source:SurveySourceProjection){
  const saved=source.interpretations?.[0]
  const project=await tx.surveyProject.findUnique({where:{id:input.projectId},select:{revision:true}})
  const current=await tx.surveyWaveFinal.findFirst({where:{id:input.finalId,projectId:input.projectId,waveId:input.waveId,
    attempt:{id:saved?.attemptId,status:'COMPLETED',excludedAt:null,OR:[{sampleReview:{is:null}},{sampleReview:{is:{verdict:'INCLUDED'}}}]}},select:{resultsHash:true}})
  if(!saved||!project||project.revision!==source.sourceRevision||!current||current.resultsHash!==saved.sourceFinalHash)
    fail('研究来源或当前访问范围已变化')
}
function decode(row:Row){
  const artifact=decryptUnifiedRuntimePayload<Artifact>(row.artifact_cipher)
  if(canonicalHash(artifact)!==row.artifact_hash||artifact.schemaVersion!==1||artifact.sourceFinalHash!==row.source_final_hash
    ||artifact.generatorVersion!==DECLARATIVE_REPORT_GENERATOR)fail('解释工件完整性校验失败')
  surveyAttemptContentBindingSchema.parse(artifact.binding)
  checkedStoredSurveyInterpretation(artifact.interpretation,artifact.binding)
  return {artifactId:row.id,finalId:row.final_id,createdAt:row.created_at,artifactHash:row.artifact_hash,
    semantics:'EXPLICIT_IMMUTABLE_INTERPRETATION' as const,accessAudience:'researcher' as const,artifact}
}
async function existing(tx:Prisma.TransactionClient,id:string){
  const rows=await tx.$queryRaw<Row[]>(Prisma.sql`SELECT * FROM survey_interpretation_artifacts WHERE id=${id} FOR SHARE`)
  return rows[0]
}
/** Actual authorized FINAL reader, never request-body scores/quality/population.
 * Data rights and template authorship remain separate. Root issuance is still
 * gated by the administrator integration; this service creates no grants.
 */
export async function createSurveyReinterpretation(actorId:string,raw:unknown){
  const input=surveyReinterpretationRequestSchema.parse(raw),requestHash=canonicalHash(input)
  await prisma.$transaction(tx=>authority(tx,actorId,input),txOptions)
  const source=await loadSurveySource({actorUserId:actorId,projectId:input.projectId,waveIds:[input.waveId],finalId:input.finalId,
    maxFinals:1,selectRaw:false,includeInterpretation:true,includeAttendance:false})
  const saved=source.interpretations?.[0]
  if(source.completeAttempts!==1||!saved?.binding)fail('此 FINAL 没有可核验的测量版本绑定')
  const old=saved!.binding!.units.find(unit=>unit.instrumentKey===input.instrumentKey)
  const versions=source.sourceVersions?.filter(v=>v.waveId===input.waveId&&v.instrumentKey===input.instrumentKey)??[]
  if(!old||versions.length!==1||canonicalHash(versions[0].measurementRelease??null)!==canonicalHash(old.measurement))
    fail('FINAL 与测量版本身份不匹配')
  return prisma.$transaction(async tx=>{
    await authority(tx,actorId,input);await fence(tx,input,source)
    // Immutable request UUID identifies retry. A retry returns the
    // exact stored artifact even after release lifecycle changes; no reselection.
    const previous=await existing(tx,input.requestId)
    if(previous){
      if(previous.created_by!==actorId||previous.final_id!==input.finalId||previous.request_hash!==requestHash
        ||previous.source_final_hash!==saved!.sourceFinalHash)fail('解释请求编号已用于其他内容')
      return decode(previous)
    }
    const cache=new Map<string,StoredRelease>()
    const read=async(releaseId:string)=>{
      let release=cache.get(releaseId)
      if(!release){release=(await getContentRelease(tx,releaseId,true))??undefined;if(release)cache.set(releaseId,release)}
      if(!release||release.scope.kind!=='PRIVATE'||release.scope.product!=='SURVEY'||release.scope.resourceId!==input.projectId
        ||release.scope.ownerId!==actorId)fail('所选内容版本不可使用')
      return release!
    }
    const measurement=await read(old!.measurement.releaseId)
    if(measurement.layer!=='MEASUREMENT'||measurement.contentHash!==old!.measurement.contentHash
      ||measurement.content.measurementHash!==old!.measurement.measurementHash||measurement.status==='REVOKED')return fail('测量版本不可用于新解释')
    const policy:FrozenReferencePolicy={policyVersion:'EXACT_POPULATION_PRIORITY_V1',measurementReleaseId:measurement.releaseId,choices:[]}
    const references=new Map<string,VerifiedReferenceForSelection>(),seen=new Set<string>()
    for(const choice of input.references){
      const key=JSON.stringify([choice.releaseId,choice.entryKey]);if(seen.has(key))fail('重复参考选择');seen.add(key)
      const release=await read(choice.releaseId)
      if(release.layer!=='REFERENCE'||release.status!=='PUBLISHED'||release.family!==measurement.family
        ||release.content.measurement.releaseId!==measurement.releaseId||release.content.measurement.contentHash!==measurement.contentHash)
        return fail('参考版本与事实不兼容或不可用于新解释')
      const entries=release.content.entries.filter(e=>referenceEntryKey(e.definition as unknown as AssessmentReferenceEntry)===choice.entryKey)
      if(entries.length!==1)fail('参考条目身份不匹配')
      policy.choices.push({...choice,contentHash:release.contentHash,metricKey:entries[0].metricKey,referenceKind:entries[0].referenceKind})
      references.set(release.releaseId,{releaseId:release.releaseId,contentHash:release.contentHash,status:release.status,
        measurementReleaseId:measurement.releaseId,entries:release.content.entries.map(e=>e.definition as unknown as AssessmentReferenceEntry)})
    }
    const unit:SurveyAttemptContentBinding['units'][number]={instrumentKey:input.instrumentKey,measurement:old!.measurement,
      references:selectFrozenReferencePolicy(policy,[...references.values()],saved!.binding!.populationContext)}
    let template:Extract<StoredRelease,{layer:'REPORT'}>|undefined
    if(input.reportReleaseId){
      const release=await read(input.reportReleaseId)
      if(release.layer!=='REPORT'||release.status!=='PUBLISHED'||release.family!==measurement.family
        ||release.content.generatorVersion!==DECLARATIVE_REPORT_GENERATOR||release.content.measurements.length!==1
        ||canonicalHash(release.content.measurements[0])!==canonicalHash({releaseId:measurement.releaseId,contentHash:measurement.contentHash}))return fail('报告模板与事实不兼容或不可用于新解释')
      template=release;unit.report={releaseId:release.releaseId,contentHash:release.contentHash};unit.reportAvailability='AVAILABLE'
    }
    const binding=surveyAttemptContentBindingSchema.parse({...saved!.binding,units:[unit]})
    const scores=source.scores.filter(score=>score.attemptId===saved!.attemptId&&score.measurement.instrumentKey===input.instrumentKey)
    if(new Set(scores.map(score=>score.measurement.scoreKey)).size!==scores.length||scores.some(score=>!score.sourceVerified
      ||score.sourceFinalHash!==saved!.sourceFinalHash||score.projectId!==input.projectId||score.waveId!==input.waveId
      ||score.measurement.scoringDigest!==versions[0].scoringDigest||!measurement.content.metrics.some(metric=>metric.metricKey===score.measurement.scoreKey)))
      fail('FINAL 指标来源不一致')
    const facts:SurveyInterpretationFacts={notExecuted:!scores.length,quality:scores.length&&scores.every(score=>score.quality?.status==='interpretable')?'interpretable':undefined,
      metrics:scores.map(score=>({key:score.measurement.scoreKey,value:score.value,status:score.status===(measurement.family==='COGNITIVE'?'OK':'calculated')
        &&score.missingReason===null&&score.value!==null&&Number.isFinite(score.value)?'OK':'UNAVAILABLE'}))}
    // Reuse verified releases in this request; no second database load/context.
    const interpretation=await interpretSurveyContentBinding(tx,{binding,ownerId:actorId,readFacts:()=>facts,releases:cache})
    const personal=interpretation.units[0]
    const report=template?renderDeclaredReport(template.content.template,
      scores.filter(score=>template!.content.metricKeys.includes(score.measurement.scoreKey)).map(score=>({metricKey:score.measurement.scoreKey,value:score.value,
        unit:measurement.content.metrics.find(metric=>metric.metricKey===score.measurement.scoreKey)!.unit,
        status:score.quality?.status==='interpretable'&&facts.metrics.find(metric=>metric.key===score.measurement.scoreKey)?.status==='OK'?'INTERPRETABLE':score.quality?.status==='invalid'?'INVALID':'UNAVAILABLE'})),
      personal.references.map(reference=>({metricKey:reference.metricKey,referenceKind:reference.referenceKind,status:reference.status==='AVAILABLE'?'AVAILABLE':'UNAVAILABLE',bandKey:reference.values?.bandKey??null}))):null
    const artifact:Artifact={schemaVersion:1,sourceFinalHash:saved!.sourceFinalHash,sourceBindingHash:canonicalHash(saved!.binding),binding,referencePolicy:policy,interpretation,report,generatorVersion:DECLARATIVE_REPORT_GENERATOR}
    const cipher=encryptUnifiedRuntimePayload(artifact),artifactHash=canonicalHash(artifact)
    if(Buffer.byteLength(cipher)>2*1024*1024)throw new SurveyAnalyticsError(413,'单份解释工件超出大小限制')
    const rows=await tx.$queryRaw<Row[]>(Prisma.sql`INSERT INTO survey_interpretation_artifacts
      (id,final_id,created_by,request_hash,source_final_hash,artifact_cipher,artifact_hash)
      VALUES (${input.requestId},${input.finalId},${actorId},${requestHash},${saved!.sourceFinalHash},${cipher},${artifactHash}) ON CONFLICT (id) DO NOTHING RETURNING *`)
    const stored=rows[0]??await existing(tx,input.requestId)
    if(!stored||stored.created_by!==actorId||stored.final_id!==input.finalId||stored.request_hash!==requestHash
      ||stored.source_final_hash!==saved!.sourceFinalHash)fail('解释请求编号已用于其他内容')
    return decode(stored!)
  },txOptions)
}

/** Current authorized data reader; returning a saved artifact never reruns its
 * selector, numerical reference resolution, renderer or lifecycle choice. */
export async function readSurveyReinterpretation(actorId:string,input:{projectId:string;waveId:string;finalId:string;artifactId:string}){
  const source=await loadSurveySource({actorUserId:actorId,projectId:input.projectId,waveIds:[input.waveId],finalId:input.finalId,
    maxFinals:1,selectRaw:false,selectScore:false,includeInterpretation:true,includeAttendance:false})
  if(source.completeAttempts!==1)throw new SurveyAnalyticsError(404,'研究数据不可访问')
  return prisma.$transaction(async tx=>{
    await authorizedProject(tx,actorId,input.projectId,false);await fence(tx,input,source)
    const row=await existing(tx,input.artifactId)
    if(!row||row.final_id!==input.finalId||row.source_final_hash!==source.interpretations?.[0]?.sourceFinalHash)
      throw new SurveyAnalyticsError(404,'解释工件不可访问')
    const result=decode(row)
    if(result.artifact.binding.projectId!==input.projectId||result.artifact.binding.waveId!==input.waveId
      ||result.artifact.binding.attemptId!==source.interpretations?.[0]?.attemptId)fail('解释工件范围不匹配')
    return result
  },txOptions)
}
