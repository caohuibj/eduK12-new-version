import {Prisma} from '@prisma/client'
import {canonicalHash} from '../assessment-runtime/canonical'
import {assertReleaseReadable,ContentReleaseError,prepareRelease} from './release'
import {getContentRelease,type StoredRelease} from './repository'
import {formalConsentEvidenceSchema,formalReferencePromotionSchema,referenceCandidateRelease,type ReferenceCandidate} from './reference-candidate'
import type {VerifiedReferenceForSelection} from './reference-policy'

/** Consumer-only aggregate resolver. suppliedRelease must have been loaded with
 * a current shared lifecycle lock in this same transaction; it permits callers
 * to reuse their request-local exact-release cache. The caller still authorizes
 * its own measurement/material and target scope. Scientific grant expiry after
 * publication is not retroactive revocation: explicit release lifecycle governs.
 */
export async function resolveFormalReferenceRelease(tx:Prisma.TransactionClient,input:{
  releaseId:string;contentHash:string;measurementReleaseId:string;purpose:'NEW_BINDING'|'REINTERPRETATION'|'HISTORY';
},suppliedRelease?:StoredRelease):Promise<VerifiedReferenceForSelection>{
  const release=suppliedRelease??await getContentRelease(tx,input.releaseId,true)
  const fail=():never=>{throw new ContentReleaseError('FORMAL_REFERENCE_RELEASE_NOT_ELIGIBLE')}
  if(!release||release.releaseId!==input.releaseId||release.contentHash!==input.contentHash||release.layer!=='REFERENCE'
    ||release.scope.kind!=='PLATFORM'||release.content.measurement.releaseId!==input.measurementReleaseId)fail()
  // Type narrowing uses the explicit guards above; no candidate/member payload is returned.
  if(!release||release.layer!=='REFERENCE')return fail()
  assertReleaseReadable(release.status,input.purpose)
  const candidateId=release.provenance.candidateId,reviewId=release.provenance.reviewId
  if(typeof candidateId!=='string'||typeof reviewId!=='string')return fail()
  const [row]=await tx.$queryRaw<Array<{payload:ReferenceCandidate;candidate_hash:string;reviewer_id:string;
    decision:'APPROVED'|'REJECTED';statement:string;reviewed_at:Date;reviewer_grant_id:string|null;reviewer_grant_version:number|null}>>(Prisma.sql`
    SELECT c.payload,r.candidate_hash,r.reviewer_id,r.decision,r.statement,r.reviewed_at,r.reviewer_grant_id,r.reviewer_grant_version
    FROM measurement_reference_candidates c JOIN measurement_reference_reviews r ON r.candidate_id=c.id
    WHERE c.id=${candidateId} AND r.id=${reviewId} FOR SHARE OF c,r`)
  if(!row||!row.reviewer_grant_id||!row.reviewer_grant_version||row.payload.scope.kind!=='PLATFORM'
    ||row.reviewer_grant_version<1||row.payload.sourceBinding!==undefined||row.payload.definition.entries.length!==1
    ||row.payload.definition.entries[0].referenceKind!=='normative_distribution'
    ||!formalConsentEvidenceSchema.safeParse(row.payload.formalConsentEvidence).success
    ||!formalReferencePromotionSchema.safeParse(row.payload.formalPromotion).success)return fail()
  const expected=referenceCandidateRelease(row.payload,{candidateHash:row.candidate_hash,reviewerId:row.reviewer_id,
    decision:row.decision,statement:row.statement,reviewedAt:row.reviewed_at.toISOString()},release.key,release.version)
  expected.provenance={...expected.provenance,candidateId,reviewId}
  if(prepareRelease(expected).contentHash!==release.contentHash||canonicalHash(expected.provenance)!==canonicalHash(release.provenance)
    ||canonicalHash(expected.scope)!==canonicalHash(release.scope)||release.sourceReleaseId!==null||release.assetRefs.length
    ||expected.family!==release.family)return fail()
  return {releaseId:release.releaseId,contentHash:release.contentHash,measurementReleaseId:input.measurementReleaseId,
    status:release.status,entries:row.payload.definition.entries.map(entry=>JSON.parse(JSON.stringify(entry)))}
}
