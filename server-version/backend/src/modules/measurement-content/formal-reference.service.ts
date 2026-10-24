import {Prisma} from '@prisma/client'
import {z} from 'zod'
import {prisma} from '../../config/database'
import {canonicalHash} from '../assessment-runtime/canonical'
import {verifySurveyReferenceCandidate,surveyReferenceConsentEvidence,assertSurveyReferenceSubmissionAuthority} from '../survey/reference-candidates.service'
import {assertTrainingReferenceAuthority} from '../training-analysis/reference-source'
import {verifyTrainingReferenceCandidate,readTrainingReferenceCandidateRecord} from '../training-analysis/reference-candidates.service'
import {ContentReleaseError} from './release'
import {assertFormalReferenceAuthority,listFormalReferenceAuthorities} from './formal-reference-authority'
import {formalReferenceCandidateView,prepareFormalReferenceCandidate} from './formal-reference'
import {formalReferencePromotionSchema,reviewReferenceCandidate,type ReferenceCandidate} from './reference-candidate'
import {publishReviewedReferenceCandidate,storeReferenceCandidate} from './reference-candidate.repository'

const uuid=z.string().guid(),digest=z.string().regex(/^[a-f0-9]{64}$/)
const statement=z.string().trim().min(1).max(4000)
const options={isolationLevel:Prisma.TransactionIsolationLevel.ReadCommitted,maxWait:5000,timeout:10000}
const fail=(code:string):never=>{throw new ContentReleaseError(code)}
export async function readFormalReferenceAuthorities(actorId:string){
  return prisma.$transaction(tx=>listFormalReferenceAuthorities(tx,actorId),options)
}
export const formalReferenceSubmitSchema=formalReferencePromotionSchema.omit({kind:true})
export const formalReferenceActionSchema=z.object({candidateId:uuid,grantId:uuid}).strict()
export const formalReferenceReadSchema=formalReferenceActionSchema.extend({purpose:z.enum(['REVIEW','PUBLISH']).default('REVIEW')}).strict()
export const formalReferenceReviewSchema=formalReferenceActionSchema.extend({
  requestId:uuid,candidateHash:digest,decision:z.enum(['APPROVED','REJECTED']),statement,consentReviewed:z.literal(true),
}).strict()
export const formalReferencePublishSchema=formalReferenceActionSchema.extend({
  candidateHash:digest,reviewId:uuid,localKey:z.string().trim().min(1).max(165),version:z.string().trim().min(1).max(240),
}).strict()
async function candidateById(tx:Prisma.TransactionClient,id:string){
  const [row]=await tx.$queryRaw<Array<{payload:ReferenceCandidate}>>(Prisma.sql`
    SELECT payload FROM measurement_reference_candidates WHERE id=${id} FOR SHARE`)
  if(!row)fail('REFERENCE_CANDIDATE_NOT_FOUND')
  const {candidateHash,...payload}=row.payload
  if(canonicalHash(payload)!==candidateHash)fail('REFERENCE_REVIEW_STALE')
  return row.payload
}
type ExactGrant={grantId:string;version:number}
function sameGrant(expected:ExactGrant,current:ExactGrant){
  if(current.grantId!==expected.grantId||current.version!==expected.version)fail('REFERENCE_AUTHORITY_STALE')
}
async function assertSubmittedSourceAuthority(tx:Prisma.TransactionClient,source:ReferenceCandidate,analyzeGrantId:string){
  if(source.sourceBinding?.kind==='SURVEY_VERIFIED_SOURCE_V1')return assertSurveyReferenceSubmissionAuthority(tx,source,analyzeGrantId)
  if(source.sourceBinding?.kind==='TRAINING_VERIFIED_SOURCE_V1')return assertTrainingReferenceAuthority(tx,{
    actorId:source.analyzerId,courseId:source.sourceBinding.courseId,compositeId:source.sourceBinding.compositeId,grantId:analyzeGrantId,
  },'reference.analyze')
  return fail('REFERENCE_FORMAL_SOURCE_REQUIRED')
}
/** A stored owner submission is the only authority for this internal recheck.
 * The reviewing/publishing actor never becomes the source owner and receives
 * aggregate DTOs only. Revoking the source owner's analyze grant closes it. */
async function verifySubmittedSource(tx:Prisma.TransactionClient,sourceCandidateId:string,source:ReferenceCandidate,analyzeGrantId:string){
  if(source.scope.kind!=='PRIVATE'||source.scope.ownerId!==source.analyzerId||source.formalPromotion)
    return fail('REFERENCE_FORMAL_SOURCE_REQUIRED')
  const sourceGrant=await assertSubmittedSourceAuthority(tx,source,analyzeGrantId)
  if(source.sourceBinding?.kind==='SURVEY_VERIFIED_SOURCE_V1'){
    const checked=await verifySurveyReferenceCandidate(tx,source,analyzeGrantId)
    const consentEvidence=await surveyReferenceConsentEvidence(tx,source)
    return {...checked,consentEvidence,sourceGrant}
  }
  if(source.sourceBinding?.kind==='TRAINING_VERIFIED_SOURCE_V1'){
    const context={actorId:source.analyzerId,courseId:source.sourceBinding.courseId,
      compositeId:source.sourceBinding.compositeId,grantId:analyzeGrantId}
    const record=await readTrainingReferenceCandidateRecord(tx,context,sourceCandidateId)
    if(record.candidate.candidateHash!==source.candidateHash)fail('REFERENCE_REVIEW_STALE')
    const checked=await verifyTrainingReferenceCandidate(tx,context,source)
    sameGrant(sourceGrant,await assertTrainingReferenceAuthority(tx,context,'reference.analyze'))
    if(checked.source.consentCoveredSampleCount!==source.sampleManifest.length)fail('REFERENCE_CONSENT_EVIDENCE_UNAVAILABLE')
    return {...checked,sourceGrant,consentEvidence:checked.source.consentScopes.map(scope=>({
      version:String(scope.version),scopeHash:scope.scopeHash,purpose:scope.purpose,dataCategories:scope.dataCategories,body:scope.body,bodyHash:scope.bodyHash,
    }))}
  }
  return fail('REFERENCE_FORMAL_SOURCE_REQUIRED')
}
async function rebuildFormalCandidate(tx:Prisma.TransactionClient,candidate:ReferenceCandidate){
  const promotion=formalReferencePromotionSchema.parse(candidate.formalPromotion)
  const source=await candidateById(tx,promotion.sourceCandidateId)
  if(source.candidateHash!==promotion.sourceCandidateHash||source.analyzerId!==candidate.analyzerId)
    fail('REFERENCE_REVIEW_STALE')
  const checked=await verifySubmittedSource(tx,promotion.sourceCandidateId,source,promotion.analyzeGrantId)
  const rebuilt=prepareFormalReferenceCandidate(source,promotion,checked.facts,checked.consentEvidence)
  if(rebuilt.candidate.candidateHash!==candidate.candidateHash)fail('REFERENCE_REVIEW_STALE')
  return {...rebuilt,source,sourceGrant:checked.sourceGrant,analyzeGrantId:promotion.analyzeGrantId}
}

/** Explicit source-owner promotion, never an uploaded distribution. Exact
 * normalized retries reuse candidate_hash; a different proposal creates a new
 * DRAFT identity and cannot borrow an older review. */
export async function submitFormalReferenceCandidate(actorId:string,entry:'TRAINING'|'SURVEY',raw:unknown){
  const input=formalReferenceSubmitSchema.parse(raw)
  return prisma.$transaction(async tx=>{
    const source=await candidateById(tx,input.sourceCandidateId)
    if(source.scope.kind!=='PRIVATE'||source.scope.product!==entry||source.scope.ownerId!==actorId
      ||source.analyzerId!==actorId||source.candidateHash!==input.sourceCandidateHash)fail('REFERENCE_FORMAL_SOURCE_REQUIRED')
    const checked=await verifySubmittedSource(tx,input.sourceCandidateId,source,input.analyzeGrantId)
    const prepared=prepareFormalReferenceCandidate(source,{kind:'FORMAL_CROSS_ENTRY_SUBMISSION_V1',...input},checked.facts,checked.consentEvidence)
    const result=await storeReferenceCandidate(tx,prepared.input,prepared.facts)
    sameGrant(checked.sourceGrant,await assertSubmittedSourceAuthority(tx,source,input.analyzeGrantId))
    return {candidateId:result.candidateId,...formalReferenceCandidateView(result.candidate)}
  },options)
}
async function withFormalCandidate<T>(actorId:string,input:z.infer<typeof formalReferenceActionSchema>,
  capability:'reference.review'|'reference.publish',
  work:(tx:Prisma.TransactionClient,candidate:ReferenceCandidate,
    verified:Awaited<ReturnType<typeof rebuildFormalCandidate>>,grant:{grantId:string;version:number})=>Promise<T>){
  return prisma.$transaction(async tx=>{
    const candidate=await candidateById(tx,input.candidateId)
    if(candidate.scope.kind!=='PLATFORM'||!candidate.formalPromotion)fail('REFERENCE_FORMAL_CANDIDATE_REQUIRED')
    const initialGrant=await assertFormalReferenceAuthority(tx,{actorId,grantId:input.grantId,capability,measurementReleaseId:candidate.measurement.releaseId})
    const verified=await rebuildFormalCandidate(tx,candidate)
    const grant=await assertFormalReferenceAuthority(tx,{actorId,grantId:input.grantId,capability,measurementReleaseId:candidate.measurement.releaseId})
    sameGrant(initialGrant,grant)
    const result=await work(tx,candidate,verified,grant)
    // All writes, unique conflicts and release-axis advisory waits precede these
    // exact original authority/clock checks. Source fences remain transaction-held.
    sameGrant(verified.sourceGrant,await assertSubmittedSourceAuthority(tx,verified.source,verified.analyzeGrantId))
    sameGrant(grant,await assertFormalReferenceAuthority(tx,{actorId,grantId:input.grantId,capability,measurementReleaseId:candidate.measurement.releaseId}))
    return result
  },options)
}
export async function readFormalReferenceCandidate(actorId:string,raw:unknown){
  const input=formalReferenceReadSchema.parse(raw)
  return withFormalCandidate(actorId,input,input.purpose==='PUBLISH'?'reference.publish':'reference.review',async(_tx,candidate)=>({
    candidateId:input.candidateId,...formalReferenceCandidateView(candidate),
  }))
}
type ReviewRow={id:string;candidate_id:string;candidate_hash:string;reviewer_id:string;
  reviewer_grant_id:string|null;reviewer_grant_version:number|null;decision:'APPROVED'|'REJECTED';statement:string;reviewed_at:Date}
/** requestId is the immutable review ID. Lost responses can retry the exact
 * request; reusing an ID for another candidate/decision/actor/grant is rejected. */
export async function reviewFormalReferenceCandidate(actorId:string,raw:unknown){
  const input=formalReferenceReviewSchema.parse(raw)
  return withFormalCandidate(actorId,input,'reference.review',async(tx,candidate,_verified,grant)=>{
    const review=reviewReferenceCandidate(candidate,{candidateHash:input.candidateHash,reviewerId:actorId,
      reviewedAt:new Date().toISOString(),decision:input.decision,statement:input.statement})
    await tx.$executeRaw(Prisma.sql`INSERT INTO measurement_reference_reviews
      (id,candidate_id,candidate_hash,reviewer_id,reviewer_grant_id,reviewer_grant_version,decision,statement,reviewed_at)
      VALUES (${input.requestId},${input.candidateId},${review.candidateHash},${actorId},${grant.grantId},${grant.version},
        ${review.decision},${review.statement},${new Date(review.reviewedAt)}) ON CONFLICT(id) DO NOTHING`)
    const [saved]=await tx.$queryRaw<ReviewRow[]>(Prisma.sql`SELECT * FROM measurement_reference_reviews WHERE id=${input.requestId} FOR SHARE`)
    if(!saved||saved.candidate_id!==input.candidateId||saved.candidate_hash!==input.candidateHash
      ||saved.reviewer_id!==actorId||saved.reviewer_grant_id!==grant.grantId||saved.reviewer_grant_version!==grant.version
      ||saved.decision!==input.decision||saved.statement!==input.statement)fail('REFERENCE_REVIEW_REQUEST_CONFLICT')
    return {reviewId:saved.id,candidateId:saved.candidate_id,candidateHash:saved.candidate_hash,
      decision:saved.decision,reviewedAt:saved.reviewed_at.toISOString()}
  })
}
export async function publishFormalReferenceCandidate(actorId:string,raw:unknown){
  const input=formalReferencePublishSchema.parse(raw)
  return withFormalCandidate(actorId,input,'reference.publish',async(tx,candidate,verified)=>{
    if(candidate.candidateHash!==input.candidateHash)fail('REFERENCE_REVIEW_STALE')
    const [review]=await tx.$queryRaw<ReviewRow[]>(Prisma.sql`SELECT * FROM measurement_reference_reviews
      WHERE id=${input.reviewId} AND candidate_id=${input.candidateId} AND candidate_hash=${input.candidateHash} FOR SHARE`)
    if(!review||review.decision!=='APPROVED'||!review.reviewer_grant_id||!review.reviewer_grant_version)
      fail('REFERENCE_APPROVED_REVIEW_NOT_FOUND')
    if(review.reviewer_id===candidate.analyzerId)fail('REFERENCE_INDEPENDENT_REVIEW_REQUIRED')
    const reviewerGrant=await assertFormalReferenceAuthority(tx,{actorId:review.reviewer_id,grantId:review.reviewer_grant_id!,
      capability:'reference.review',measurementReleaseId:candidate.measurement.releaseId})
    if(reviewerGrant.version!==review.reviewer_grant_version)fail('REFERENCE_REVIEW_STALE')
    await assertFormalReferenceAuthority(tx,{actorId,grantId:input.grantId,
      capability:'reference.publish',measurementReleaseId:candidate.measurement.releaseId})
    const release=await publishReviewedReferenceCandidate(tx,{
      candidateId:input.candidateId,reviewId:input.reviewId,localKey:input.localKey,version:input.version,actorId,purpose:'NEW_ADMINISTRATION',
    },verified.facts)
    sameGrant(reviewerGrant,await assertFormalReferenceAuthority(tx,{actorId:review.reviewer_id,grantId:review.reviewer_grant_id!,
      capability:'reference.review',measurementReleaseId:candidate.measurement.releaseId}))
    return {releaseId:release.releaseId,contentHash:release.contentHash,version:release.version,
      status:release.status,family:release.family,layer:release.layer}
  })
}
