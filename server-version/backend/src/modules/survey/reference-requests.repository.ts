import { Prisma } from '@prisma/client'
import { canonicalHash } from '../assessment-runtime/canonical'
import { ContentReleaseError } from '../measurement-content/release'

export type ReferenceRequest = {
  request_id:string; actor_id:string; project_id:string; wave_id:string;
  operation:'CREATE'|'REVIEW'; input_hash:string; candidate_id:string;
  review_id:string|null; exclusion_counts:Record<string,number>|null;
}
export function referenceRequestHash(actorId:string,operation:ReferenceRequest['operation'],input:unknown){
  return canonicalHash({actorId,operation,input})
}
export async function lockReferenceRequest(tx:Prisma.TransactionClient,requestId:string){
  // Transaction-scoped, bounded by the caller's short write transaction. Hash
  // collisions only serialize unrelated requests; the exact UUID is the PK.
  await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${requestId}, 71025))`)
}
export async function findReferenceRequest(tx:Prisma.TransactionClient,requestId:string){
  const rows=await tx.$queryRaw<ReferenceRequest[]>(Prisma.sql`
    SELECT request_id,actor_id,project_id,wave_id,operation,input_hash,candidate_id,review_id,exclusion_counts
    FROM survey_reference_requests WHERE request_id=${requestId}::uuid`)
  return rows[0]??null
}
export function assertReferenceRequestIdentity(row:ReferenceRequest,actorId:string,input:{projectId:string;waveId:string},
  expected?:{operation:ReferenceRequest['operation'];inputHash:string}){
  if(row.actor_id!==actorId||row.project_id!==input.projectId||row.wave_id!==input.waveId)
    throw new ContentReleaseError('REFERENCE_REQUEST_SCOPE_MISMATCH')
  if(expected&&(row.operation!==expected.operation||row.input_hash!==expected.inputHash))
    throw new ContentReleaseError('REFERENCE_REQUEST_INPUT_MISMATCH')
}
export async function storeReferenceRequest(tx:Prisma.TransactionClient,row:ReferenceRequest){
  // No ON CONFLICT overwrite: candidate/review and mapping are one transaction,
  // and any unexpected uniqueness failure rolls back all of its writes.
  await tx.$executeRaw(Prisma.sql`INSERT INTO survey_reference_requests
    (request_id,actor_id,project_id,wave_id,operation,input_hash,candidate_id,review_id,exclusion_counts)
    VALUES (${row.request_id}::uuid,${row.actor_id},${row.project_id},${row.wave_id},${row.operation},${row.input_hash},
      ${row.candidate_id},${row.review_id},${row.exclusion_counts===null?null:JSON.stringify(row.exclusion_counts)}::jsonb)`)
}
