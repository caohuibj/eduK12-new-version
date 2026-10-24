import {Prisma,UserRole} from '@prisma/client'
import {z} from 'zod'
import {canonicalHash} from '../assessment-runtime/canonical'
import {ContentAuthorityError} from '../measurement-content/content-authority'
import {assertContentAuthority} from '../measurement-content/content-authority.repository'
import {ContentReleaseError} from '../measurement-content/release'
import {getContentRelease} from '../measurement-content/repository'
import {decodeTrainingFinalReceipt} from '../composite/training-content-final'
import {trainingContentSnapshotSchema} from '../composite/training-content-binding'
import {loadTrainingAnalysisSources,type TrainingAnalysisManifestAttemptV1} from './source'
import {TRAINING_ANALYSIS_MINIMUM_N} from './core'
import {referenceConsentBodyHash,trainingReferenceSourceBindingSchema,type TrainingReferenceSourceBinding} from '../measurement-content/reference-candidate'

const uuid=z.string().guid(),text=z.string().trim().min(1).max(200),digest=z.string().regex(/^[a-f0-9]{64}$/)
export const trainingReferenceContextSchema=z.object({actorId:text,courseId:uuid,compositeId:uuid,grantId:uuid}).strict()
export type TrainingReferenceContext=z.infer<typeof trainingReferenceContextSchema>
export const trainingReferenceSelectorSchema=z.object({itemId:uuid,scoreKey:text,publication:z.string().datetime(),
 configDigest:digest.nullable(),variantKey:text.nullable(),materialGroupKey:text.optional()}).strict().superRefine((value,ctx)=>{
 if((value.configDigest===null)!==(value.variantKey===null)||value.materialGroupKey!==undefined&&value.configDigest!==null)
  ctx.addIssue({code:'custom',message:'Invalid frozen variant identity'})
})
export type TrainingReferenceSelector=z.infer<typeof trainingReferenceSelectorSchema>
type Capability='reference.analyze'|'reference.review'|'reference.publish'
function fail(code:string):never{throw new ContentReleaseError(code)}
function deny():never{throw new ContentAuthorityError('CONTENT_AUTHORITY_DENIED')}
export async function assertTrainingReferenceAuthority(tx:Prisma.TransactionClient,context:TrainingReferenceContext,capability:Capability){
 trainingReferenceContextSchema.parse(context)
 // Course -> current principal -> task/delivery -> explicit scientific grant.
 // A management projection or course share never becomes sample access.
 const [course]=await tx.$queryRaw<Array<{creator_id:string;course_type:string;is_library:boolean}>>(Prisma.sql`
  SELECT creator_id,course_type,is_library FROM courses WHERE id=${context.courseId} FOR SHARE`)
 if(!course||course.creator_id!==context.actorId||course.course_type!=='TRAINING_COURSE'||course.is_library)deny()
 const [user]=await tx.$queryRaw<Array<{role:string;teacher_approved:boolean;account_domain:string;is_active:boolean;is_frozen:boolean;must_change_password:boolean;expires_at:Date|null}>>(Prisma.sql`
  SELECT role::text,teacher_approved,account_domain,is_active,is_frozen,must_change_password,expires_at FROM users WHERE id=${context.actorId} FOR SHARE`)
 if(!user||user.role!=='TEACHER'||!user.teacher_approved||!['TRAINING','LEGACY'].includes(user.account_domain)||!user.is_active||user.is_frozen||user.must_change_password)deny()
 const [task]=await tx.$queryRaw<Array<{created_by:string;course_id:string|null;product_kind:string;questionnaire_type:string|null}>>(Prisma.sql`
  SELECT created_by,course_id,product_kind,questionnaire_type::text FROM composite_assessments WHERE id=${context.compositeId} FOR SHARE`)
 const delivery=await tx.$queryRaw<Array<{course_id:string}>>(Prisma.sql`
  SELECT course_id FROM questionnaire_course_deliveries WHERE composite_id=${context.compositeId} AND course_id=${context.courseId} FOR SHARE`)
 if(!task||task.created_by!==context.actorId||!['QUESTIONNAIRE','LEGACY_COMPOSITE'].includes(task.product_kind)
  ||(task.product_kind==='QUESTIONNAIRE'?(task.questionnaire_type!=='COURSE'||delivery.length!==1):task.course_id!==context.courseId))deny()
 const grant=await assertContentAuthority(tx,{actorId:context.actorId,grantId:context.grantId,capability,scope:{product:'TRAINING',scopeKind:'COURSE',
  scopeId:context.courseId,resourceKind:'reference',resourceKeys:[context.compositeId]}})
 const [clock]=await tx.$queryRaw<Array<{now:Date}>>(Prisma.sql`SELECT clock_timestamp() AS now`)
 if(!clock||user.expires_at&&user.expires_at<=clock.now)deny()
 return grant
}
type Attempt={id:string;attempt_epoch:number;training_content_binding:unknown;training_content_binding_hash:string|null;
 training_reference_binding?:unknown;training_reference_binding_hash?:string|null;context_snapshot_hash?:string|null;
 aggregate_input_hash:string|null;training_content_interpretation_encrypted:string|null;training_content_interpretation_hash:string|null}
const attemptBindingSchema=trainingContentSnapshotSchema.extend({attemptId:text,epoch:z.number().int().positive(),publicationHash:digest}).strict()
const sourceKey=(row:{attemptId:string;attemptEpoch:number;sourceHash:string})=>`${row.attemptId}:${row.attemptEpoch}:${row.sourceHash}`
/** Internal source reader only. Every mutable source/consent/quality fence stays
 * locked through the candidate/review/publication write. No raw answers/scorer.
 * Stored source IDs freeze membership; newly arriving FINALs never join retries.
 */
export async function readTrainingReferenceSource(tx:Prisma.TransactionClient,context:TrainingReferenceContext,
 selector:TrainingReferenceSelector,frozen?:TrainingReferenceSourceBinding){
 const cutoff=frozen?.cutOff??new Date().toISOString()
 if(frozen&&(frozen.courseId!==context.courseId||frozen.compositeId!==context.compositeId||canonicalHash(frozen.selector)!==canonicalHash(selector)))fail('REFERENCE_TRAINING_SOURCE_CHANGED')
 const attempts=await tx.$queryRaw<Attempt[]>(Prisma.sql`SELECT id,attempt_epoch,training_content_binding,training_content_binding_hash,
  training_reference_binding,training_reference_binding_hash,context_snapshot_hash,
  aggregate_input_hash,training_content_interpretation_encrypted,training_content_interpretation_hash FROM composite_assessment_attempts
  WHERE composite_assessment_id=${context.compositeId} AND delivery_course_id=${context.courseId}
    AND (assignment_ref IS NULL OR assignment_ref IN (SELECT id FROM relational_assessment_assignments
      WHERE created_by_user_id=${context.actorId} AND perspective='OBSERVER_REPORT' AND analysis_mode='INDIVIDUAL_ONLY'
        AND visibility_policy_key='observer_assigning_teacher_v1'))
    AND status='COMPLETED' AND delivery_mode='FINAL_ONLY' AND runtime_generation='UNIFIED_V1' AND completed_at<=${new Date(cutoff)}
    ${frozen?Prisma.sql`AND id IN (${Prisma.join(frozen.sourceIds.map(row=>row.attemptId))})`:Prisma.empty}
  ORDER BY id LIMIT 251 FOR SHARE`)
 if(!attempts.length||attempts.length>250)fail('REFERENCE_TRAINING_SAMPLE_BOUND')
 if(frozen&&(attempts.length!==frozen.sourceIds.length||frozen.sourceIds.some(source=>!attempts.some(a=>a.id===source.attemptId&&a.attempt_epoch===source.attemptEpoch))))fail('REFERENCE_TRAINING_SOURCE_CHANGED')
 // Consent publication/withdrawal and participant retirement all lock these
 // same study rows before mutation. Hold them before loading any sample values.
 await tx.$queryRaw(Prisma.sql`SELECT s.id FROM anonymous_studies s JOIN anonymous_study_waves w ON w.study_id=s.id
  JOIN composite_assessment_attempts a ON a.access_token_id=w.access_token_id WHERE a.id IN (${Prisma.join(attempts.map(a=>a.id))}) ORDER BY s.id FOR SHARE OF s`)
 const wave={waveKey:'reference',taskId:context.compositeId,publication:selector.publication,configDigest:selector.configDigest,
  variantKey:selector.variantKey,...(selector.materialGroupKey===undefined?{}:{materialGroupKey:selector.materialGroupKey}),metrics:[{itemId:selector.itemId,metricKey:selector.scoreKey}]}
 const fixed:TrainingAnalysisManifestAttemptV1[]=attempts.map(row=>({waveKey:wave.waveKey,taskId:context.compositeId,
  ...(selector.materialGroupKey===undefined?{}:{materialGroupKey:selector.materialGroupKey}),attemptId:row.id,attemptEpoch:row.attempt_epoch,
  sourceHash:'',sourceHashes:{},status:'COMPLETED',taskSatisfaction:null}))
 const loaded=await loadTrainingAnalysisSources(tx,{userId:context.actorId,role:UserRole.TEACHER},
  {schemaVersion:1,courseId:context.courseId,mode:'FULL_CASE',waves:[wave]},
  {authorityLock:'SHARE',fixedManifest:{attempts:fixed},sourceCutoff:cutoff})
 const quality=await tx.trainingAnalysisQuality.findMany({where:{courseId:context.courseId,attemptId:{in:attempts.map(a=>a.id)}}})
 const qualityByKey=new Map(quality.map(row=>[sourceKey(row),row]))
 const governance=new Map(loaded.researchGovernance.map(row=>[row.attemptId,row]))
 const headers=new Map(attempts.map(row=>[row.id,row])),manifest=new Map(loaded.manifest.attempts.map(row=>[row.attemptId,row]))
 const exclusionCounts:Record<string,number>={identityUnavailable:loaded.manifest.exclusions.IDENTITY_UNAVAILABLE,notSelected:attempts.length-loaded.manifest.attempts.length-loaded.manifest.exclusions.IDENTITY_UNAVAILABLE,
  invalidOrMissing:0,qualityExcluded:0,researchNotEligible:0,repeatedParticipant:0,legacyBinding:0}
 const eligible:Array<{factId:string;factVersion:string;value:number;measurementReleaseId:string}>=[]
 let measurement:Awaited<ReturnType<typeof getContentRelease>>=null
 const participants=new Set<string>(),measurementIdentities=new Set<string>()
 for(const observation of loaded.source.observations){
  const head=observation.attemptId?headers.get(observation.attemptId):undefined,source=observation.attemptId?manifest.get(observation.attemptId):undefined
  if(!head||!source||observation.attemptEpoch!==head.attempt_epoch||observation.itemId!==selector.itemId||observation.metricKey!==selector.scoreKey)fail('REFERENCE_TRAINING_SOURCE_CHANGED')
  const research=governance.get(head.id)
  if(observation.participantKind==='STUDY_LOCAL'&&(!research||research.status!=='CONSENTED'||!research.acceptanceId||!observation.researchCategory||!research.dataCategories?.includes(observation.researchCategory))){exclusionCounts.researchNotEligible++;continue}
  if(qualityByKey.get(sourceKey(source))?.verdict==='EXCLUDE'){exclusionCounts.qualityExcluded++;continue}
  if(observation.reason!==null||observation.value===null||!Number.isFinite(observation.value)||observation.measurementQuality!=='interpretable'||observation.metricQuality!==undefined&&!['calculated','OK','interpretable'].includes(observation.metricQuality)||!observation.measurement){exclusionCounts.invalidOrMissing++;continue}
  if(head.training_content_binding==null&&head.training_content_binding_hash==null){exclusionCounts.legacyBinding++;continue}
  const binding=attemptBindingSchema.parse(head.training_content_binding)
  if(canonicalHash(binding)!==head.training_content_binding_hash||binding.attemptId!==head.id||binding.epoch!==head.attempt_epoch||binding.compositeId!==context.compositeId)fail('REFERENCE_TRAINING_MEASUREMENT_MISMATCH')
  const unit=binding.units.find(row=>row.itemId===selector.itemId)
  if(!unit)fail('REFERENCE_TRAINING_MEASUREMENT_MISMATCH')
  const receipt=decodeTrainingFinalReceipt({id:head.id,attemptEpoch:head.attempt_epoch,compositeAssessmentId:context.compositeId,
   trainingContentBinding:head.training_content_binding,trainingContentBindingHash:head.training_content_binding_hash,
   trainingReferenceBinding:head.training_reference_binding,trainingReferenceBindingHash:head.training_reference_binding_hash,contextSnapshotHash:head.context_snapshot_hash,
   aggregateInputHash:head.aggregate_input_hash,trainingContentInterpretationEncrypted:head.training_content_interpretation_encrypted,
   trainingContentInterpretationHash:head.training_content_interpretation_hash})
  if(!receipt||receipt.sources.find(row=>row.itemId===selector.itemId)?.resultHash!==observation.sourceHashes[selector.itemId])fail('REFERENCE_TRAINING_MEASUREMENT_MISMATCH')
  if(!measurement)measurement=await getContentRelease(tx,unit.measurement.releaseId,true)
  if(!measurement||measurement.layer!=='MEASUREMENT'||measurement.status==='REVOKED'||measurement.family!==unit.family
   ||measurement.releaseId!==unit.measurement.releaseId||measurement.contentHash!==unit.measurement.contentHash||measurement.content.measurementHash!==unit.measurement.measurementHash
   ||!measurement.content.metrics.some(metric=>metric.metricKey===selector.scoreKey))fail('REFERENCE_TRAINING_MEASUREMENT_MISMATCH')
  measurementIdentities.add(canonicalHash(observation.measurement))
  if(measurementIdentities.size!==1)fail('REFERENCE_TRAINING_MEASUREMENT_MISMATCH')
  const participant=canonicalHash([observation.participantKind,observation.participantKey])
  // A participant contributes at most once. Rather than inventing a "best" or
  // latest attempt, require an explicitly unambiguous sample selection.
  if(participants.has(participant))fail('REFERENCE_TRAINING_REPEATED_PARTICIPANT')
  participants.add(participant)
  eligible.push({factId:head.id,factVersion:canonicalHash({sourceHash:source.sourceHash,bindingHash:head.training_content_binding_hash,
   receiptHash:head.training_content_interpretation_hash}),value:observation.value,measurementReleaseId:measurement.releaseId})
 }
 const minimumN=loaded.source.observations.reduce((n,row)=>Math.max(n,row.minimumN??0),TRAINING_ANALYSIS_MINIMUM_N)
 if(!measurement||measurement.layer!=='MEASUREMENT'||eligible.length<minimumN)fail('REFERENCE_TRAINING_SAMPLE_SUPPRESSED')
 const sourceHash=canonicalHash({manifest:loaded.manifest,governance:loaded.researchGovernance,
  quality:loaded.manifest.attempts.map(row=>({key:sourceKey(row),review:qualityByKey.has(sourceKey(row))?{verdict:qualityByKey.get(sourceKey(row))!.verdict,revision:qualityByKey.get(sourceKey(row))!.revision}:null})),
  bindings:attempts.map(a=>({id:a.id,binding:a.training_content_binding_hash,receipt:a.training_content_interpretation_hash}))})
 const binding=trainingReferenceSourceBindingSchema.parse({kind:'TRAINING_VERIFIED_SOURCE_V1',courseId:context.courseId,compositeId:context.compositeId,
  selector,cutOff:cutoff,sourceHash,sourceIds:attempts.map(row=>({attemptId:row.id,attemptEpoch:row.attempt_epoch}))})
 if(frozen&&sourceHash!==frozen.sourceHash)fail('REFERENCE_TRAINING_SOURCE_CHANGED')
 const instrumentKey=loaded.source.observations.find(row=>row.attemptId===eligible[0].factId)!.measurement!.instrumentKey
 const consentIds=[...new Set(eligible.flatMap(row=>{const consent=governance.get(row.factId);return consent?.acceptedVersionId?[consent.acceptedVersionId]:[]}))].sort()
 const consentRows=consentIds.length?await tx.$queryRaw<Array<{id:string;study_id:string;scope_id:string;version:number;body:string;body_hash:string;scope_hash:string;scope:unknown}>>(Prisma.sql`
  SELECT id,study_id,scope_id,version,body,body_hash,scope_hash,scope FROM anonymous_study_consent_versions WHERE id IN (${Prisma.join(consentIds)}) ORDER BY id FOR SHARE`):[]
 const consentSchema=z.object({purpose:z.string().min(1),dataCategories:z.array(z.enum(['FORM','SCALE','COGNITIVE','SJT'])).min(1),waveCoverage:z.literal('EXISTING_AND_FUTURE')}).strict()
 if(consentRows.length!==consentIds.length)fail('REFERENCE_TRAINING_SOURCE_CHANGED')
 const consentScopes=consentRows.map(row=>{
  const scope=consentSchema.parse(row.scope)
  if(typeof row.body!=='string'||!row.body.length||row.body.length>20000||referenceConsentBodyHash(row.body)!==row.body_hash
    ||row.scope_id!==row.study_id||canonicalHash({scopeId:row.scope_id,...scope})!==row.scope_hash
    ||loaded.researchGovernance.some(g=>g.acceptedVersionId===row.id&&(g.scopeHash!==row.scope_hash||g.bodyHash!==row.body_hash||g.studyId!==row.study_id||!g.acceptanceId)))fail('REFERENCE_TRAINING_SOURCE_CHANGED')
  return {versionId:row.id,version:row.version,scopeHash:row.scope_hash,purpose:scope.purpose,dataCategories:scope.dataCategories,body:row.body,bodyHash:row.body_hash}
 })
 const consentCoveredSampleCount=eligible.filter(row=>{const consent=governance.get(row.factId);return Boolean(consent?.acceptedVersionId&&consentScopes.some(scope=>scope.versionId===consent.acceptedVersionId&&scope.scopeHash===consent.scopeHash&&scope.bodyHash===consent.bodyHash))}).length
 return {measurement,eligible,binding,exclusionCounts,instrumentKey,consentScopes,consentCoveredSampleCount}
}
