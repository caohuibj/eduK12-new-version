import {Prisma} from '@prisma/client'
import {assertLibraryAuthority} from './authority'
import {fail,librarySourceProduct,type LibraryProduct,type LibrarySourceProduct} from './contracts'
import {assertScaleLibraryCollectionAllowed} from './collection-guard'
export type LibraryUseRow={id:string;entry_id:string;user_id:string|null;scope_kind:'USER'|'ORGANIZATION';organization_id:string|null;product:LibraryProduct;issuer_id:string;authority_grant_id:string|null;
  material_grant_id:string|null;survey_tool_grant_id:string|null;status:string;version:number;reason:string|null;created_at:Date;revoked_at:Date|null}
export const useView=(r:LibraryUseRow)=>({id:r.id,entryId:r.entry_id,userId:r.user_id,scopeKind:r.scope_kind,organizationId:r.organization_id,product:r.product,issuerId:r.issuer_id,status:r.status,version:r.version,reason:r.reason,createdAt:r.created_at})
/** Only NEW use/import/publication calls this. Frozen runtime calls only the
 * emergency guard. No inherited edit/adapt/distribute permission is created. */
export async function assertLibraryUseGrantCurrent(tx:Prisma.TransactionClient,input:{entryId:string;userId:string;product:LibrarySourceProduct}){
  librarySourceProduct.parse(input.product)
  const [header]=await tx.$queryRaw<LibraryUseRow[]>(Prisma.sql`SELECT * FROM scale_library_use_grants WHERE entry_id=${input.entryId} AND user_id=${input.userId} AND product=${input.product} AND scope_kind='USER' AND organization_id IS NULL AND status='ACTIVE'`)
  if(!header)fail('共用库使用授权已撤销',403)
  const [entry]=await tx.$queryRaw<Array<{release_id:string;status:string}>>(Prisma.sql`SELECT release_id,status FROM scale_library_entries WHERE id=${input.entryId}`)
  if(!entry)fail('共用库条目不存在',404)
  await assertLibraryAuthority(tx,header.issuer_id,entry.release_id,'material.distribute',input.product,header.authority_grant_id??undefined)
  await assertScaleLibraryCollectionAllowed(tx,[entry.release_id])
  const [lockedEntry]=await tx.$queryRaw<Array<{status:string}>>(Prisma.sql`SELECT status FROM scale_library_entries WHERE id=${input.entryId} FOR SHARE`)
  const [grant]=await tx.$queryRaw<LibraryUseRow[]>(Prisma.sql`SELECT * FROM scale_library_use_grants WHERE id=${header.id} FOR SHARE`)
  if(lockedEntry?.status!=='ACTIVE'||grant?.status!=='ACTIVE')fail('共用库条目下架或使用授权已撤销')
  if(input.product==='TRAINING'&&(!grant.material_grant_id||!await tx.materialGrant.findUnique({where:{id:grant.material_grant_id}})))fail('共用库使用授权已撤销',403)
  if(input.product==='SURVEY'){const rows=await tx.$queryRaw<Array<{id:string}>>(Prisma.sql`SELECT id FROM survey_tool_grants WHERE id=${grant.survey_tool_grant_id} AND status='ACTIVE' FOR SHARE`);if(!rows.length)fail('共用库使用授权已撤销',403)}
  return grant
}
