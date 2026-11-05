import {Prisma} from '@prisma/client'
import {assertToolEntryPolicy,prefetchToolPolicyAdmission} from '../assessment-governance/tool-entry-policy'
import {fail,legacyLibraryProduct,type LibraryProduct,type LegacyLibraryProduct} from './contracts'
import {assertScaleLibraryCollectionAllowed} from './collection-guard'
export type LibraryUseRow={id:string;entry_id:string;user_id:string|null;scope_kind:'USER'|'ORGANIZATION';organization_id:string|null;product:LibraryProduct;issuer_id:string;authority_grant_id:string|null;
  material_grant_id:string|null;survey_tool_grant_id:string|null;status:string;version:number;reason:string|null;created_at:Date;revoked_at:Date|null}
export const useView=(r:LibraryUseRow)=>({id:r.id,entryId:r.entry_id,userId:r.user_id,scopeKind:r.scope_kind,organizationId:r.organization_id,product:r.product,issuerId:r.issuer_id,status:r.status,version:r.version,reason:r.reason,createdAt:r.created_at})
/** Only NEW use/import/publication/admission calls this. Already-admitted
 * runtime never reenters it. No edit/adapt/distribute permission is created. */
export async function assertLibraryUseGrantCurrent(tx:Prisma.TransactionClient,input:{entryId:string;userId:string;product:LegacyLibraryProduct}){
  return (await assertLibraryUseGrantsCurrent(tx,{entryIds:[input.entryId],userId:input.userId,product:input.product})).get(input.entryId)!
}
/** Same checks for many entries in set-based reads, so admission cost does not
 * grow one round-trip group per entry. Lock order per kind is unchanged:
 * release/ancestor locks, then entry locks, then policy, then use grants. */
export async function assertLibraryUseGrantsCurrent(tx:Prisma.TransactionClient,input:{entryIds:readonly string[];userId:string;product:LegacyLibraryProduct}){
  legacyLibraryProduct.parse(input.product)
  const entryIds=[...new Set(input.entryIds)].sort()
  if(!entryIds.length)return new Map()
  const headers=await tx.$queryRaw<LibraryUseRow[]>(Prisma.sql`SELECT * FROM scale_library_use_grants WHERE entry_id=ANY(${entryIds}::text[]) AND user_id=${input.userId} AND product=${input.product} AND scope_kind='USER' AND organization_id IS NULL AND status='ACTIVE'`)
  const header=new Map<string,LibraryUseRow>()
  for(const row of headers)if(!header.has(row.entry_id))header.set(row.entry_id,row)
  if(entryIds.some(id=>!header.has(id)))fail('共用库使用授权已撤销',403)
  const entries=new Map((await tx.$queryRaw<Array<{id:string;release_id:string;status:string;content_hash:string}>>(Prisma.sql`SELECT e.id,e.release_id,e.status,r.content_hash FROM scale_library_entries e JOIN measurement_content_releases r ON r.id=e.release_id WHERE e.id=ANY(${entryIds}::text[])`)).map(row=>[row.id,row]))
  if(entryIds.some(id=>!entries.has(id)))fail('共用库条目不存在',404)
  // Release/ancestor locks must precede entry locks, matching emergency stop.
  const releaseIds=[...new Set(entryIds.map(id=>entries.get(id)!.release_id))]
  for(let i=0;i<releaseIds.length;i+=200)await assertScaleLibraryCollectionAllowed(tx,releaseIds.slice(i,i+200))
  const lockedEntries=new Map((await tx.$queryRaw<Array<{id:string;status:string}>>(Prisma.sql`SELECT id,status FROM scale_library_entries WHERE id=ANY(${entryIds}::text[]) ORDER BY id FOR SHARE`)).map(row=>[row.id,row.status]))
  // Issuance already checked the distributor. Check only explicit entry/stop
  // facts now, never the issuer's current account or entry qualification.
  const identities=entryIds.map(id=>({resourceKey:'release:'+entries.get(id)!.release_id,fingerprint:entries.get(id)!.content_hash}))
  await prefetchToolPolicyAdmission(tx,identities,input.product)
  for(const identity of identities)await assertToolEntryPolicy(tx,identity,input.product)
  const authorityIds=[...new Set(entryIds.flatMap(id=>{const v=header.get(id)!.authority_grant_id;return v?[v]:[]}))]
  if(authorityIds.length){
    // The exact delegated scope was validated at issuance. Check only its
    // mutable stop/time boundary for NEW admission; never reapprove the issuer.
    const roots=new Map((await tx.$queryRaw<Array<{id:string;ancestry:string[]}>>(Prisma.sql`SELECT id,ancestry FROM content_capability_grants WHERE id=ANY(${authorityIds}::text[])`)).map(row=>[row.id,row]))
    const closure=new Set<string>()
    for(const authorityGrantId of authorityIds){
      const root=roots.get(authorityGrantId)
      if(!root||!Array.isArray(root.ancestry)||root.ancestry.length>128)fail('原精确委托已不可用',403)
      closure.add(authorityGrantId);for(const id of root.ancestry)closure.add(id)
    }
    const ids=[...closure].sort()
    const active=new Set((await tx.$queryRaw<Array<{id:string}>>(Prisma.sql`WITH locked AS MATERIALIZED (
      SELECT id,revoked_at,valid_from,expires_at FROM content_capability_grants WHERE id IN (${Prisma.join(ids)}) ORDER BY id FOR SHARE
    ) SELECT id FROM locked WHERE revoked_at IS NULL AND valid_from<=(clock_timestamp() AT TIME ZONE 'UTC') AND expires_at>(clock_timestamp() AT TIME ZONE 'UTC')`)).map(row=>row.id))
    for(const authorityGrantId of authorityIds){
      const root=roots.get(authorityGrantId)!
      if([authorityGrantId,...root.ancestry].some(id=>!active.has(id)))fail('原精确委托已撤销、尚未生效或到期，停止新入场',403)
    }
  }
  const grantIds=entryIds.map(id=>header.get(id)!.id)
  const grants=new Map((await tx.$queryRaw<LibraryUseRow[]>(Prisma.sql`SELECT * FROM scale_library_use_grants WHERE id=ANY(${grantIds}::text[]) ORDER BY id FOR SHARE`)).map(row=>[row.id,row]))
  const result=new Map<string,LibraryUseRow>()
  for(const id of entryIds){
    const grant=grants.get(header.get(id)!.id)
    if(lockedEntries.get(id)!=='ACTIVE'||grant?.status!=='ACTIVE')fail('共用库条目下架或使用授权已撤销')
    result.set(id,grant!)
  }
  if(input.product==='TRAINING'){
    const materialIds=[...result.values()].map(grant=>grant.material_grant_id)
    if(materialIds.some(id=>!id))fail('共用库使用授权已撤销',403)
    const found=new Set((await tx.materialGrant.findMany({where:{id:{in:materialIds as string[]}},select:{id:true}})).map(row=>row.id))
    if(materialIds.some(id=>!found.has(id!)))fail('共用库使用授权已撤销',403)
  }
  if(input.product==='SURVEY'){
    const toolIds=[...new Set([...result.values()].map(grant=>grant.survey_tool_grant_id))]
    const rows=toolIds.every(Boolean)?await tx.$queryRaw<Array<{id:string}>>(Prisma.sql`SELECT id FROM survey_tool_grants WHERE id=ANY(${toolIds as string[]}::text[]) AND status='ACTIVE' ORDER BY id FOR SHARE`):[]
    if(rows.length!==toolIds.length)fail('共用库使用授权已撤销',403)
  }
  return result
}
