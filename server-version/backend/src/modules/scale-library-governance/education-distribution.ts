import {Prisma} from '@prisma/client'
import {resolveEducationProductMemberScope} from '../organization/educationProductAccess'
import {educationDistributionInput,educationLibraryEntry,fail} from './contracts'
import {prepareEducationLibraryResources,lockEducationLibraryOrganization,assertEducationLibraryReadCommitted} from './education-runtime-resources'
import {assertLibraryAuthority} from './authority'
import {event} from './service'
import {type LibraryUseRow,useView} from './usage'

/** Internal transaction adapter, deliberately NOT routed by public grantUse yet.
 * The same transaction creates exact resources and grants; a failed target or
 * insert rolls back wrappers/Composites too. No Training material grant is made.
 */
export async function grantEducationLibraryUseInTransaction(tx:Prisma.TransactionClient,actorId:string,entryId:string,raw:unknown){
  const input=educationDistributionInput.parse(raw)
  await assertEducationLibraryReadCommitted(tx)
  const [header]=await tx.$queryRaw<Array<{release_id:string}>>(Prisma.sql`SELECT release_id FROM scale_library_entries WHERE id=${entryId}`)
  if(!header)fail('共用库条目不存在',404)
  // Existing content-authority helper locks issuer + its immutable ancestry.
  // Hold these before org, matching account-management's user -> org order.
  await assertLibraryAuthority(tx,actorId,header.release_id,'material.distribute',input.product,input.grantId)
  await lockEducationLibraryOrganization(tx,input.organizationId,input.product)
  if(input.scopeKind==='USER'){
    const member=await resolveEducationProductMemberScope({actorUserId:input.userId,organizationId:input.organizationId,
      product:educationLibraryEntry[input.product]},tx)
    if(!member)fail('EDUCATION_LIBRARY_TARGET_MEMBERSHIP_REQUIRED',403)
  }
  const prepared=await prepareEducationLibraryResources(tx,{actorId,entryId,organizationId:input.organizationId,
    product:input.product,grantId:input.grantId,expectedGrantVersion:input.expectedGrantVersion})
  const [prior]=await tx.$queryRaw<LibraryUseRow[]>(Prisma.sql`SELECT * FROM scale_library_use_grants WHERE id=${input.requestId} FOR SHARE`)
  if(prior){
    if(prior.entry_id!==entryId||prior.product!==input.product||prior.organization_id!==input.organizationId||prior.scope_kind!==input.scopeKind
      ||prior.user_id!==input.userId||prior.issuer_id!==actorId||prior.authority_grant_id!==prepared.authority.grantId)
      fail('请求编号已用于其他授权')
    return {grant:useView(prior),resources:prepared.resources}
  }
  const [row]=await tx.$queryRaw<LibraryUseRow[]>(Prisma.sql`INSERT INTO scale_library_use_grants
    (id,entry_id,user_id,product,scope_kind,organization_id,issuer_id,authority_grant_id)
    VALUES(${input.requestId},${entryId},${input.userId},${input.product},${input.scopeKind},${input.organizationId},${actorId},${prepared.authority.grantId}) RETURNING *`)
  await event(tx,actorId,'USE_GRANTED','分配教育入口精确版本，仅使用，不包含编辑、再授权或个人报告读取权',prepared.submissionId,entryId,
    {grantId:row.id,product:input.product,scopeKind:input.scopeKind,organizationId:input.organizationId,userId:input.userId,
      authorityGrantId:prepared.authority.grantId,resources:prepared.resources.map(resource=>({key:resource.resourceEntry.applicability.resourceKey,version:resource.adapterVersion}))})
  return {grant:useView(row),resources:prepared.resources}
}
