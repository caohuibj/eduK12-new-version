import {Prisma} from '@prisma/client'
import {AdminPermissionError} from '../admin-permissions/service'
export type ToolEntryProduct='TRAINING'|'SURVEY'
export type PolicyIdentity={resourceKey:string;fingerprint:string}
export type ToolPolicy={decision:'PENDING'|'APPROVED'|'RETURNED';paused:boolean;version:number;reason:string}
export async function readToolPolicy(tx:Prisma.TransactionClient,identity:PolicyIdentity,lock=false,product:ToolEntryProduct='SURVEY'):Promise<ToolPolicy>{
 if(lock)await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'survey-tool:'+identity.resourceKey}))`
 const rows=await tx.$queryRaw<ToolPolicy[]>(Prisma.sql`SELECT decision,paused,version,reason FROM survey_tool_policies
  WHERE product=${product} AND resource_key=${identity.resourceKey} AND fingerprint=${identity.fingerprint} ${lock?Prisma.sql`FOR SHARE`:Prisma.empty}`)
 return rows[0]??{decision:'PENDING',paused:false,version:0,reason:product+' 入口尚未获准'}
}
/** Current list hints only, never an authority cache or an action proof. */
export async function readToolPolicies(tx:Prisma.TransactionClient,identities:readonly PolicyIdentity[],product:ToolEntryProduct='SURVEY'){
 if(!identities.length)return new Map<string,ToolPolicy>()
 const rows=await tx.$queryRaw<Array<ToolPolicy&{resource_key:string;fingerprint:string}>>(Prisma.sql`SELECT resource_key,fingerprint,decision,paused,version,reason FROM survey_tool_policies WHERE product=${product} AND (resource_key,fingerprint) IN (${Prisma.join(identities.map(i=>Prisma.sql`(${i.resourceKey},${i.fingerprint})`))})`)
 return new Map(identities.map(i=>[i.resourceKey+':'+i.fingerprint,rows.find(r=>r.resource_key===i.resourceKey&&r.fingerprint===i.fingerprint)??{decision:'PENDING' as const,paused:false,version:0,reason:product+' 入口尚未获准'}]))
}
/** Called only by an already authorized global intake/entry-scope mutation.
 * The source row is locked first. One review records its selected entry scopes;
 * this does not create user grants or declare an unsupported adapter usable. */
export function exactToolEntryProducts(value:unknown):ToolEntryProduct[]{
 if(!Array.isArray(value)||!value.length||value.length>2||new Set(value).size!==value.length||value.some(p=>p!=='TRAINING'&&p!=='SURVEY'))
  throw new AdminPermissionError(400,'批准时必须明确选择允许的入口，且不能重复')
 return [...value].sort() as ToolEntryProduct[]
}
export async function approveToolEntryPolicies(tx:Prisma.TransactionClient,identity:PolicyIdentity,rawProducts:unknown,actorId:string,reason:string){
 const products=exactToolEntryProducts(rawProducts)
 await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'survey-tool:'+identity.resourceKey}))`
 // A later explicit scope change stops new admission in removed entries.
 await tx.$executeRaw(Prisma.sql`UPDATE survey_tool_policies SET decision='RETURNED',reason=${reason},reviewed_by=${actorId},
  version=version+1,updated_at=clock_timestamp() WHERE resource_key=${identity.resourceKey} AND fingerprint=${identity.fingerprint}
  AND product NOT IN (${Prisma.join(products)}) AND decision<>'RETURNED'`)
 for(const product of products)await tx.$executeRaw`INSERT INTO survey_tool_policies(product,resource_key,fingerprint,decision,paused,reason,reviewed_by)
  VALUES(${product},${identity.resourceKey},${identity.fingerprint},'APPROVED',false,${reason},${actorId})
  ON CONFLICT(product,resource_key,fingerprint) DO UPDATE SET decision='APPROVED',paused=false,reason=EXCLUDED.reason,
   reviewed_by=EXCLUDED.reviewed_by,version=survey_tool_policies.version+1,updated_at=clock_timestamp()`
 return products
}
export async function assertToolEntryPolicy(tx:Prisma.TransactionClient,identity:PolicyIdentity,product:ToolEntryProduct){
 const policy=await readToolPolicy(tx,identity,true,product)
 if(policy.decision!=='APPROVED'||policy.paused)throw new AdminPermissionError(409,'该精确版本未获本入口准入或已停止新增使用：'+product+'；'+policy.reason)
 return policy
}
