import {Prisma} from '@prisma/client'
import {z} from 'zod'
import {AdminPermissionError} from '../admin-permissions/service'
import {getContentRelease} from '../measurement-content/repository'
import {ContentAuthorityError} from '../measurement-content/content-authority'
import {resolveEducationProductMemberScope} from '../organization/educationProductAccess'
import {assertLibraryAuthority} from './authority'
import {assertScaleLibraryCollectionAllowed} from './collection-guard'
import {educationLibraryProduct,educationLibraryEntry,EDUCATION_LIBRARY_ADAPTER_NOT_READY,ScaleLibraryError,fail} from './contracts'
import {loadEntry} from './service'
import type {LibraryUseRow} from './usage'

export const educationLibraryUseInput=z.object({
  product:educationLibraryProduct,organizationId:z.string().uuid(),actorId:z.string().uuid(),
  entryId:z.string().uuid(),releaseId:z.string().uuid(),contentHash:z.string().regex(/^[a-f0-9]{64}$/),
}).strict()

/** Read-only authorization projection, NOT a publication/runtime capability.
 * The future adapter must call within the action transaction and recheck current
 * membership/denies there; this result must never be cached as a bearer grant.
 * Media and rawScoreFeedback remain intact in the approved content snapshot.
 */
export async function readEducationLibraryUse(tx:Prisma.TransactionClient,raw:z.input<typeof educationLibraryUseInput>,options?:{onlyGrantId:string}){
  const input=educationLibraryUseInput.parse(raw)
  const onlyGrantId=options?z.string().uuid().parse(options.onlyGrantId):null
  const member=await resolveEducationProductMemberScope({actorUserId:input.actorId,
    organizationId:input.organizationId,product:educationLibraryEntry[input.product]},tx)
  if(!member)fail('EDUCATION_LIBRARY_MEMBERSHIP_REQUIRED',403)
  const {entry,submission}=await loadEntry(tx,input.entryId)
  if(entry.release_id!==input.releaseId||entry.content_hash!==input.contentHash)fail('EDUCATION_LIBRARY_EXACT_VERSION_MISMATCH',409)
  const release=await getContentRelease(tx,entry.release_id,true)
  if(!release||release.layer!=='MEASUREMENT'||release.family!=='SCALE'||release.status!=='PUBLISHED'||release.contentHash!==input.contentHash)fail('EDUCATION_LIBRARY_RELEASE_UNAVAILABLE',409)
  if(entry.status!=='ACTIVE')fail('共用库条目不再接受新使用',409)
  await assertScaleLibraryCollectionAllowed(tx,[entry.release_id])
  const grants=await tx.$queryRaw<LibraryUseRow[]>(Prisma.sql`
    SELECT * FROM scale_library_use_grants WHERE entry_id=${input.entryId} AND product=${input.product}
      AND organization_id=${input.organizationId} AND status='ACTIVE'
      AND (${onlyGrantId}::text IS NULL OR id=${onlyGrantId})
      AND ((scope_kind='USER' AND user_id=${input.actorId}) OR (scope_kind='ORGANIZATION' AND user_id IS NULL))
    ORDER BY scope_kind DESC,id FOR SHARE`)
  let accepted:LibraryUseRow|undefined
  for(const grant of grants){
    try{
      await assertLibraryAuthority(tx,grant.issuer_id,entry.release_id,'material.distribute',input.product,grant.authority_grant_id??undefined)
      accepted=grant;break
    }catch(error){
      // A revoked issuer/delegation invalidates only that grant, not a second
      // independently valid organization/user grant. Infrastructure errors escape.
      if(!(error instanceof ContentAuthorityError)&&!((error instanceof ScaleLibraryError||error instanceof AdminPermissionError)&&error.statusCode===403))throw error
    }
  }
  if(!accepted)fail('EDUCATION_LIBRARY_USE_GRANT_REQUIRED',403)
  return {entryId:entry.id,releaseId:entry.release_id,contentHash:entry.content_hash!,
    product:input.product,organizationId:input.organizationId,actorId:input.actorId,membershipId:member.membershipId,
    grantId:accepted.id,grantVersion:accepted.version,scopeKind:accepted.scope_kind,
    sourceProduct:submission.product,authorizationStatus:'AUTHORIZED_AT_READ' as const,
    runtimeStatus:EDUCATION_LIBRARY_ADAPTER_NOT_READY,canDistribute:false as const,canPublish:false as const,
  }
}
