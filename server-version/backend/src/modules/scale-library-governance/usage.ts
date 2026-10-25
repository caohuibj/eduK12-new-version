import {Prisma} from '@prisma/client'
import {assertToolEntryPolicy} from '../assessment-governance/tool-entry-policy'
import {fail,legacyLibraryProduct,type LibraryProduct,type LegacyLibraryProduct} from './contracts'
import {assertScaleLibraryCollectionAllowed} from './collection-guard'
export type LibraryUseRow={id:string;entry_id:string;user_id:string|null;scope_kind:'USER'|'ORGANIZATION';organization_id:string|null;product:LibraryProduct;issuer_id:string;authority_grant_id:string|null;
  material_grant_id:string|null;survey_tool_grant_id:string|null;status:string;version:number;reason:string|null;created_at:Date;revoked_at:Date|null}
export const useView=(r:LibraryUseRow)=>({id:r.id,entryId:r.entry_id,userId:r.user_id,scopeKind:r.scope_kind,organizationId:r.organization_id,product:r.product,issuerId:r.issuer_id,status:r.status,version:r.version,reason:r.reason,createdAt:r.created_at})
/** Only NEW use/import/publication/admission calls this. Already-admitted
 * runtime never reenters it. No edit/adapt/distribute permission is created. */
export async function assertLibraryUseGrantCurrent(tx:Prisma.TransactionClient,input:{entryId:string;userId:string;product:LegacyLibraryProduct}){
  legacyLibraryProduct.parse(input.product)
  const [header]=await tx.$queryRaw<LibraryUseRow[]>(Prisma.sql`SELECT * FROM scale_library_use_grants WHERE entry_id=${input.entryId} AND user_id=${input.userId} AND product=${input.product} AND scope_kind='USER' AND organization_id IS NULL AND status='ACTIVE'`)
  if(!header)fail('共用库使用授权已撤销',403)
  const [entry]=await tx.$queryRaw<Array<{release_id:string;status:string;content_hash:string}>>(Prisma.sql`SELECT e.release_id,e.status,r.content_hash FROM scale_library_entries e JOIN measurement_content_releases r ON r.id=e.release_id WHERE e.id=${input.entryId}`)
  if(!entry)fail('共用库条目不存在',404)
  // Release/ancestor locks must precede entry locks, matching emergency stop.
  await assertScaleLibraryCollectionAllowed(tx,[entry.release_id])
  const [lockedEntry]=await tx.$queryRaw<Array<{status:string}>>(Prisma.sql`SELECT status FROM scale_library_entries WHERE id=${input.entryId} FOR SHARE`)
  // Issuance already checked the distributor. Check only explicit entry/stop
  // facts now, never the issuer's current account or entry qualification.
  await assertToolEntryPolicy(tx,{resourceKey:'release:'+entry.release_id,fingerprint:entry.content_hash},input.product)
  if(header.authority_grant_id){
    // The exact delegated scope was validated at issuance. Check only its
    // mutable stop/time boundary for NEW admission; never reapprove the issuer.
    const [root]=await tx.$queryRaw<Array<{ancestry:string[]}>>`SELECT ancestry FROM content_capability_grants WHERE id=${header.authority_grant_id}`
    if(!root||!Array.isArray(root.ancestry)||root.ancestry.length>128)fail('原精确委托已不可用',403)
    const ids=[...new Set([header.authority_grant_id,...root.ancestry])].sort()
    const active=await tx.$queryRaw<Array<{id:string}>>(Prisma.sql`WITH locked AS MATERIALIZED (
      SELECT id,revoked_at,valid_from,expires_at FROM content_capability_grants WHERE id IN (${Prisma.join(ids)}) ORDER BY id FOR SHARE
    ) SELECT id FROM locked WHERE revoked_at IS NULL AND valid_from<=clock_timestamp() AND expires_at>clock_timestamp()`)
    if(active.length!==ids.length)fail('原精确委托已撤销、尚未生效或到期，停止新入场',403)
  }
  const [grant]=await tx.$queryRaw<LibraryUseRow[]>(Prisma.sql`SELECT * FROM scale_library_use_grants WHERE id=${header.id} FOR SHARE`)
  if(lockedEntry?.status!=='ACTIVE'||grant?.status!=='ACTIVE')fail('共用库条目下架或使用授权已撤销')
  if(input.product==='TRAINING'&&(!grant.material_grant_id||!await tx.materialGrant.findUnique({where:{id:grant.material_grant_id}})))fail('共用库使用授权已撤销',403)
  if(input.product==='SURVEY'){const rows=await tx.$queryRaw<Array<{id:string}>>(Prisma.sql`SELECT id FROM survey_tool_grants WHERE id=${grant.survey_tool_grant_id} AND status='ACTIVE' FOR SHARE`);if(!rows.length)fail('共用库使用授权已撤销',403)}
  return grant
}
