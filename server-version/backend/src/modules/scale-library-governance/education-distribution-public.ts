import {Prisma} from '@prisma/client'
import {getContentRelease} from '../measurement-content/repository'
import {assertLibraryAuthority} from './authority'
import type {LibrarySnapshot} from './source'
import {loadEntry} from './service'
import {assertLibraryMediaReady} from './media'
import {assertScaleLibraryCollectionAllowed} from './collection-guard'
import {educationLibraryEntry,fail,type EducationLibraryProduct} from './contracts'
import {educationContentCompatibility} from './education-distribution-readiness'
import {educationRecipientInput,educationPublicGrantInput} from './education-distribution-public-contracts'
import {grantEducationLibraryUseInTransaction} from './education-distribution'

type Tx=Prisma.TransactionClient
type ExactRequest={product:EducationLibraryProduct;releaseId:string;contentHash:string;grantId?:string}
/** Read-only new-distribution preflight. Authority precedes recipient identities;
 * no wrapper/resource/grant is created by opening a picker. */
async function exactEntry(tx:Tx,actorId:string,entryId:string,input:ExactRequest){
 const [header]=await tx.$queryRaw<Array<{release_id:string}>>(Prisma.sql`SELECT release_id FROM scale_library_entries WHERE id=${entryId}`)
 if(!header)fail('共用库条目不存在',404)
 await assertLibraryAuthority(tx,actorId,header.release_id,'material.distribute',input.product,input.grantId)
 const {entry,submission}=await loadEntry(tx,entryId)
 if(entry.release_id!==input.releaseId||entry.content_hash!==input.contentHash)fail('EDUCATION_LIBRARY_EXACT_VERSION_MISMATCH')
 if(entry.status!=='ACTIVE'||submission.status!=='APPROVED')fail('EDUCATION_LIBRARY_ENTRY_UNAVAILABLE')
 const compatibility=educationContentCompatibility(submission.snapshot,input.product,{approved:true,dependencyReleaseIds:submission.dependency_release_ids})
 if(!compatibility.contentCompatible)fail(compatibility.reason!)
 const release=await getContentRelease(tx,entry.release_id,true)
 if(!release||release.layer!=='MEASUREMENT'||release.family!=='SCALE'||release.status!=='PUBLISHED'||release.contentHash!==input.contentHash)
  fail('EDUCATION_LIBRARY_RELEASE_UNAVAILABLE')
 await assertScaleLibraryCollectionAllowed(tx,[release.releaseId])
 if(!submission.snapshot.mediaManifest)fail('申请缺少固定附件清单')
 await assertLibraryMediaReady(tx,entryId,submission.snapshot.mediaManifest)
 return {entry,submission}
}
/** INTERNAL seam only. Public callers remain behind the final closed gate.
 * Actual resource preparation and grant insertion stay in the already-reviewed
 * adapter transaction. The exact tuple is required, never an implicit latest. */
export async function grantEducationPublicUseInTransaction(tx:Tx,actorId:string,entryId:string,raw:unknown){
 const input=educationPublicGrantInput.parse(raw)
 // Preserve issuer/ancestry -> org -> entry lock order in the existing adapter.
 // This preliminary tuple read takes no entry lock and performs no writes.
 await assertLibraryAuthority(tx,actorId,input.releaseId,'material.distribute',input.product,input.grantId)
 const [identity]=await tx.$queryRaw<Array<{release_id:string;content_hash:string;snapshot:LibrarySnapshot;status:string;dependency_release_ids:string[]}>>(Prisma.sql`SELECT e.release_id,r.content_hash,s.snapshot,s.status,s.dependency_release_ids
  FROM scale_library_entries e JOIN measurement_content_releases r ON r.id=e.release_id
   JOIN scale_library_submissions s ON s.id=e.submission_id WHERE e.id=${entryId}`)
 if(!identity||identity.release_id!==input.releaseId||identity.content_hash!==input.contentHash)fail('EDUCATION_LIBRARY_EXACT_VERSION_MISMATCH')
 const compatibility=educationContentCompatibility(identity.snapshot,input.product,{approved:identity.status==='APPROVED',dependencyReleaseIds:identity.dependency_release_ids})
 if(!compatibility.contentCompatible)fail(compatibility.reason!)
 const {releaseId:_releaseId,contentHash:_contentHash,...command}=input
 const result=await grantEducationLibraryUseInTransaction(tx,actorId,entryId,command)
 return result.grant
}

/** Same usage membership conditions as resolveEducationProductMemberScope.
 * No COUNSELOR/PSYCHOLOGY_STAFF requirement: authoring is not usage authority.
 * Actual grant commit rechecks via that canonical resolver under the org lock. */
function memberPredicate(organizationId:string,product:EducationLibraryProduct){
 return Prisma.sql`u.account_domain='SCHOOL' AND u.is_active AND NOT u.is_frozen AND NOT u.must_change_password
  AND (u.expires_at IS NULL OR u.expires_at>statement_timestamp())
  AND EXISTS(SELECT 1 FROM organization_memberships m
   JOIN organizations o ON o.id=m.organization_id
   JOIN education_product_entitlements e ON e.organization_id=o.id AND e.product=${educationLibraryEntry[product]} AND e.status='ACTIVE'
   WHERE m.user_id=u.id AND m.organization_id=${organizationId} AND o.product_domain='SCHOOL' AND o.status='ACTIVE'
    AND m.valid_from<=statement_timestamp() AND (m.valid_until IS NULL OR m.valid_until>statement_timestamp())
    AND NOT EXISTS(SELECT 1 FROM organization_access_denies d WHERE d.organization_id=o.id AND d.user_id=u.id
     AND d.lifted_at IS NULL AND d.permission IN ('*','EDUCATION_ACCESS',${educationLibraryEntry[product]+'_ACCESS'})))`
}
/** INTERNAL read seam. UUID anchors must still be eligible in the exact scoped
 * query; a cursor is not authority and never opens a different organization. */
export async function educationRecipientsInTransaction(tx:Tx,actorId:string,entryId:string,raw:unknown){
 const input=educationRecipientInput.parse(raw)
 await exactEntry(tx,actorId,entryId,input)
 const pattern='%'+input.keyword.replace(/[\\%_]/g,'\\$&')+'%'
 if(input.scopeKind==='ORGANIZATION'){
  const predicate=Prisma.sql`o.product_domain='SCHOOL' AND o.status='ACTIVE' AND o.name ILIKE ${pattern}
   AND EXISTS(SELECT 1 FROM education_product_entitlements e WHERE e.organization_id=o.id
    AND e.product=${educationLibraryEntry[input.product]} AND e.status='ACTIVE')`
  if(input.cursor){
   const anchor=await tx.$queryRaw<Array<{id:string}>>(Prisma.sql`SELECT o.id FROM organizations o WHERE ${predicate} AND o.id=${input.cursor}`)
   if(!anchor.length)fail('EDUCATION_LIBRARY_RECIPIENT_CURSOR_INVALID',400)
  }
  const rows=await tx.$queryRaw<Array<{id:string;name:string}>>(Prisma.sql`SELECT o.id,o.name FROM organizations o
   WHERE ${predicate} ${input.cursor?Prisma.sql`AND o.id>${input.cursor}`:Prisma.empty} ORDER BY o.id LIMIT 26`)
  return {product:input.product,scopeKind:input.scopeKind,list:rows.slice(0,25),nextCursor:rows.length>25?rows[24].id:null}
 }
 const [org]=await tx.$queryRaw<Array<{id:string}>>(Prisma.sql`SELECT o.id FROM organizations o
  JOIN education_product_entitlements e ON e.organization_id=o.id AND e.product=${educationLibraryEntry[input.product]} AND e.status='ACTIVE'
  WHERE o.id=${input.organizationId} AND o.product_domain='SCHOOL' AND o.status='ACTIVE'`)
 if(!org)fail('EDUCATION_LIBRARY_TARGET_ORGANIZATION_UNAVAILABLE',403)
 const predicate=Prisma.sql`${memberPredicate(input.organizationId,input.product)} AND (u.username ILIKE ${pattern} OR u.nickname ILIKE ${pattern})`
 if(input.cursor){
  const anchor=await tx.$queryRaw<Array<{id:string}>>(Prisma.sql`SELECT u.id FROM users u WHERE ${predicate} AND u.id=${input.cursor}`)
  if(!anchor.length)fail('EDUCATION_LIBRARY_RECIPIENT_CURSOR_INVALID',400)
 }
 const rows=await tx.$queryRaw<Array<{id:string;username:string;name:string|null}>>(Prisma.sql`SELECT u.id,u.username,u.nickname AS name FROM users u
  WHERE ${predicate} ${input.cursor?Prisma.sql`AND u.id>${input.cursor}`:Prisma.empty} ORDER BY u.id LIMIT 26`)
 return {product:input.product,scopeKind:input.scopeKind,organizationId:input.organizationId,list:rows.slice(0,25),nextCursor:rows.length>25?rows[24].id:null}
}
