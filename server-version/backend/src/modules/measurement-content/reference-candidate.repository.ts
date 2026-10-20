import { randomUUID } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { canonicalHash, canonicalJsonString } from '../assessment-runtime/canonical'
import { ContentReleaseError } from './release'
import { getContentRelease, publishContentRelease } from './repository'
import { prepareReferenceCandidate, reviewReferenceCandidate, referenceCandidateRelease, type ReferenceCandidate, type ReferenceCandidateReview, type AuthorizedReferenceFact } from './reference-candidate'

/** Internal transaction helpers, not endpoints. The eventual V05 service must
 * authorize actor/sample scope within this transaction. No client-supplied access map.
 */
export async function storeReferenceCandidate(db:Prisma.TransactionClient,input:Omit<ReferenceCandidate,'schemaVersion'|'candidateHash'>,
  authorizedFacts:ReadonlyMap<string,AuthorizedReferenceFact>):Promise<{candidateId:string;candidate:ReferenceCandidate}>{
  const candidate=prepareReferenceCandidate(input,authorizedFacts)
  const measurement=await getContentRelease(db,candidate.measurement.releaseId,true)
  const family={scale:'SCALE',cognitive:'COGNITIVE',sjt:'SJT'}[candidate.definition.instrumentType]
  if(!measurement||measurement.layer!=='MEASUREMENT'||measurement.family!==family||measurement.status==='REVOKED'
    ||measurement.contentHash!==candidate.measurement.contentHash||measurement.content.instrumentVersion!==candidate.measurement.instrumentVersion
    ||measurement.content.scoringVersion!==candidate.measurement.scoringVersion||measurement.content.measurementHash!==candidate.measurement.measurementHash
    ||candidate.definition.entries.some(e=>!measurement.content.metrics.some(m=>m.metricKey===e.scoreKey)))throw new ContentReleaseError('REFERENCE_MEASUREMENT_MISMATCH')
  const id=randomUUID()
  await db.$executeRaw(Prisma.sql`INSERT INTO measurement_reference_candidates
    (id,candidate_hash,measurement_release_id,analyzer_id,payload)
    VALUES (${id},${candidate.candidateHash},${candidate.measurement.releaseId},${candidate.analyzerId},${canonicalJsonString(candidate)}::jsonb)
    ON CONFLICT(candidate_hash) DO NOTHING`)
  const rows=await db.$queryRaw<Array<{id:string}>>(Prisma.sql`SELECT id FROM measurement_reference_candidates WHERE candidate_hash=${candidate.candidateHash}`)
  return {candidateId:rows[0].id,candidate}
}
export async function storeReferenceReview(db:Prisma.TransactionClient,candidateId:string,input:ReferenceCandidateReview):Promise<string>{
  const rows=await db.$queryRaw<Array<{payload:ReferenceCandidate}>>(Prisma.sql`SELECT payload FROM measurement_reference_candidates WHERE id=${candidateId} FOR SHARE`)
  if(!rows[0])throw new ContentReleaseError('REFERENCE_CANDIDATE_NOT_FOUND')
  const review=reviewReferenceCandidate(rows[0].payload,input),id=randomUUID()
  await db.$executeRaw(Prisma.sql`INSERT INTO measurement_reference_reviews
    (id,candidate_id,candidate_hash,reviewer_id,decision,statement,reviewed_at)
    VALUES (${id},${candidateId},${review.candidateHash},${review.reviewerId},${review.decision},${review.statement},${new Date(review.reviewedAt)})`)
  return id
}

/** Service supplies a verified actor and freshly scoped facts. The approved
 * review row is read here, not accepted as a client JSON approval object. */
export async function publishReviewedReferenceCandidate(db:Prisma.TransactionClient,input:{
  candidateId:string;reviewId:string;localKey:string;version:string;actorId:string;
  purpose:'NEW_ADMINISTRATION'|'HISTORICAL_INTERPRETATION'
},authorizedFacts:ReadonlyMap<string,AuthorizedReferenceFact>){
  const rows=await db.$queryRaw<Array<{payload:ReferenceCandidate;candidate_hash:string;reviewer_id:string;decision:'APPROVED'|'REJECTED';statement:string;reviewed_at:Date}>>(Prisma.sql`
    SELECT c.payload,r.candidate_hash,r.reviewer_id,r.decision,r.statement,r.reviewed_at
    FROM measurement_reference_candidates c JOIN measurement_reference_reviews r ON r.candidate_id=c.id
    WHERE c.id=${input.candidateId} AND r.id=${input.reviewId} FOR SHARE OF c,r`)
  if(!rows[0])throw new ContentReleaseError('REFERENCE_APPROVED_REVIEW_NOT_FOUND')
  const row=rows[0],{schemaVersion:_schema,candidateHash:storedHash,...candidateInput}=row.payload
  const candidate=prepareReferenceCandidate(candidateInput,authorizedFacts)
  if(candidate.candidateHash!==storedHash)throw new ContentReleaseError('REFERENCE_REVIEW_STALE')
  const review:ReferenceCandidateReview={candidateHash:row.candidate_hash,reviewerId:row.reviewer_id,
    decision:row.decision,statement:row.statement,reviewedAt:row.reviewed_at.toISOString()}
  const release=referenceCandidateRelease(candidate,review,
    `reference:${canonicalHash(candidate.scope)}:${input.localKey}`,input.version)
  release.provenance={...release.provenance,candidateId:input.candidateId,reviewId:input.reviewId}
  return publishContentRelease(db,release,input.actorId,input.purpose)
}
