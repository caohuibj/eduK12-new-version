import { randomUUID } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { canonicalJsonString } from '../assessment-runtime/canonical'
import { ContentReleaseError } from './release'
import { getContentRelease } from './repository'
import { prepareReferenceCandidate, reviewReferenceCandidate, type ReferenceCandidate, type ReferenceCandidateReview } from './reference-candidate'

/** Internal transaction helpers, not endpoints. The eventual V05 service must
 * authorize actor/sample scope within this transaction. No client-supplied access map.
 */
export async function storeReferenceCandidate(db:Prisma.TransactionClient,input:Omit<ReferenceCandidate,'schemaVersion'|'candidateHash'>,
  authorizedFactVersions:ReadonlyMap<string,string>):Promise<{candidateId:string;candidate:ReferenceCandidate}>{
  const candidate=prepareReferenceCandidate(input,authorizedFactVersions)
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
