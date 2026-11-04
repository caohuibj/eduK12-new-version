import {Prisma} from '@prisma/client'
import {AdminPermissionError} from '../admin-permissions/service'
export type ToolEntryProduct='TRAINING'|'SURVEY'
export type StandardCombinationEntryProduct=ToolEntryProduct|'SCHOOL'|'TEACHER'
export type PolicyIdentity={resourceKey:string;fingerprint:string}
export type ToolPolicy={decision:'PENDING'|'APPROVED'|'RETURNED';paused:boolean;version:number;reason:string}
/** Tool-policy lock modes on the advisory key
 * `survey-tool:<product>:<resourceKey>:<fingerprint>`, i.e. exactly one
 * survey_tool_policies primary key, so a Survey policy writer never queues
 * Training admissions (and vice versa).
 * ADMISSION_READ: transaction-scoped SHARED lock on the admitting product's key,
 * taken before the policy row is read FOR SHARE and held to commit. Concurrent
 * admissions do not block each other.
 * POLICY_MUTATION: transaction-scoped EXCLUSIVE lock on every product key the
 * writer may change (all entry products unless the writer names one). A writer
 * waits for every in-flight admission holding a shared key it writes, and later
 * shared requests queue behind it. So once a mutation has committed and returned,
 * no admission can still commit on the old policy. The advisory key also
 * serializes the PENDING->APPROVED insert race when no row exists yet.
 * Row cache: an ADMISSION_READ row is read at most once per interactive
 * transaction. It is safe because the shared key plus FOR SHARE are held to
 * commit, so no other writer can commit a change first; a mutation lock taken by
 * the same transaction drops the cache. Never cached for the global client. */
export type ToolPolicyLock=false|'ADMISSION_READ'|'POLICY_MUTATION'
type HeldMode='SHARED'|'EXCLUSIVE'
export const ALL_ENTRY_PRODUCTS:readonly StandardCombinationEntryProduct[]=['SCHOOL','SURVEY','TEACHER','TRAINING']
const heldToolPolicyLocks=new WeakMap<object,Map<string,HeldMode>>()
const admittedPolicyRows=new WeakMap<object,Map<string,ToolPolicy>>()
export const toolPolicyLockKey=(identity:PolicyIdentity,product:StandardCombinationEntryProduct)=>'survey-tool:'+product+':'+identity.resourceKey+':'+identity.fingerprint
const rowKey=(identity:PolicyIdentity,product:StandardCombinationEntryProduct)=>product+'\u0000'+identity.resourceKey+'\u0000'+identity.fingerprint
const pending=(product:string):ToolPolicy=>({decision:'PENDING',paused:false,version:0,reason:product+' 入口尚未获准'})
function rowCache(tx:Prisma.TransactionClient){
 if(typeof (tx as {$transaction?:unknown}).$transaction==='function')return null
 let rows=admittedPolicyRows.get(tx)
 if(!rows){rows=new Map();admittedPolicyRows.set(tx,rows)}
 return rows
}
/** Interactive transaction clients have no `$transaction`. The global client
 * runs each statement in its own implicit transaction, so never de-duplicate it. */
function heldLocks(tx:Prisma.TransactionClient){
 if(typeof (tx as {$transaction?:unknown}).$transaction==='function')return null
 let held=heldToolPolicyLocks.get(tx)
 if(!held){held=new Map();heldToolPolicyLocks.set(tx,held)}
 return held
}
function sortedKeys(identities:readonly PolicyIdentity[],products:readonly StandardCombinationEntryProduct[]){
 return [...new Set(identities.flatMap(identity=>products.map(product=>toolPolicyLockKey(identity,product))))].sort()
}
/** SHARED admission lock for every identity, each key at most once per
 * transaction, multiple keys in one statement in sorted key order. */
export async function lockToolPolicyAdmission(tx:Prisma.TransactionClient,identities:readonly PolicyIdentity[],product:StandardCombinationEntryProduct){
 const held=heldLocks(tx)
 const keys=sortedKeys(identities,[product]).filter(key=>!held?.has(key))
 if(!keys.length)return
 if(keys.length===1)await tx.$executeRaw`SELECT pg_advisory_xact_lock_shared(hashtext(${keys[0]}))`
 else await tx.$executeRaw`SELECT count(pg_advisory_xact_lock_shared(hashtext(k))) FROM unnest(${keys}::text[]) WITH ORDINALITY AS t(k,n)`
 for(const key of keys)held?.set(key,'SHARED')
}
/** EXCLUSIVE mutation lock, sorted key order, each key at most once per
 * transaction. A shared key already held by this transaction is still upgraded:
 * no current mutator reads its own key as an admission first. */
export async function lockToolPolicyMutation(tx:Prisma.TransactionClient,identities:readonly PolicyIdentity[],products:readonly StandardCombinationEntryProduct[]=ALL_ENTRY_PRODUCTS){
 const held=heldLocks(tx)
 admittedPolicyRows.delete(tx)
 for(const key of sortedKeys(identities,products)){
  if(held?.get(key)==='EXCLUSIVE')continue
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`
  held?.set(key,'EXCLUSIVE')
 }
}
export async function readToolPolicy(tx:Prisma.TransactionClient,identity:PolicyIdentity,lock:ToolPolicyLock=false,product:StandardCombinationEntryProduct='SURVEY'):Promise<ToolPolicy>{
 if(lock==='ADMISSION_READ'){
  const cached=rowCache(tx)?.get(rowKey(identity,product))
  if(cached)return {...cached}
  await prefetchToolPolicyAdmission(tx,[identity],product)
  return {...rowCache(tx)?.get(rowKey(identity,product))??await readAdmissionRow(tx,identity,product)}
 }
 if(lock==='POLICY_MUTATION')await lockToolPolicyMutation(tx,[identity],[product])
 const rows=await tx.$queryRaw<ToolPolicy[]>(Prisma.sql`SELECT decision,paused,version,reason FROM survey_tool_policies
  WHERE product=${product} AND resource_key=${identity.resourceKey} AND fingerprint=${identity.fingerprint} ${lock?Prisma.sql`FOR SHARE`:Prisma.empty}`)
 return rows[0]??{decision:'PENDING',paused:false,version:0,reason:product+' 入口尚未获准'}
}
async function readAdmissionRow(tx:Prisma.TransactionClient,identity:PolicyIdentity,product:StandardCombinationEntryProduct){
 const rows=await tx.$queryRaw<ToolPolicy[]>(Prisma.sql`SELECT decision,paused,version,reason FROM survey_tool_policies
  WHERE product=${product} AND resource_key=${identity.resourceKey} AND fingerprint=${identity.fingerprint} FOR SHARE`)
 return rows[0]??pending(product)
}
/** ADMISSION_READ for many identities: shared keys in one sorted statement, then
 * every not-yet-read row in one FOR SHARE query, cached to commit (see above). */
export async function prefetchToolPolicyAdmission(tx:Prisma.TransactionClient,identities:readonly PolicyIdentity[],product:StandardCombinationEntryProduct){
 await lockToolPolicyAdmission(tx,identities,product)
 const cache=rowCache(tx)
 if(!cache)return
 const missing=[...new Map(identities.filter(i=>!cache.has(rowKey(i,product))).map(i=>[rowKey(i,product),i])).values()]
 if(!missing.length)return
 const rows=missing.length===1
  ?[{resource_key:missing[0].resourceKey,fingerprint:missing[0].fingerprint,...await readAdmissionRow(tx,missing[0],product)}]
  :await tx.$queryRaw<Array<ToolPolicy&{resource_key:string;fingerprint:string}>>(Prisma.sql`SELECT resource_key,fingerprint,decision,paused,version,reason FROM survey_tool_policies
   WHERE product=${product} AND (resource_key,fingerprint) IN (${Prisma.join(missing.map(i=>Prisma.sql`(${i.resourceKey},${i.fingerprint})`))}) ORDER BY resource_key,fingerprint FOR SHARE`)
 for(const i of missing){
  const r=rows.find(r=>r.resource_key===i.resourceKey&&r.fingerprint===i.fingerprint)
  cache.set(rowKey(i,product),r?{decision:r.decision,paused:r.paused,version:r.version,reason:r.reason}:pending(product))
 }
}
/** Current list hints only, never an authority cache or an action proof. */
export async function readToolPolicies(tx:Prisma.TransactionClient,identities:readonly PolicyIdentity[],product:StandardCombinationEntryProduct='SURVEY'){
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
/** Education approval is limited to exact standard combinations. Other native
 * and governed-tool approval adapters keep their existing two-entry contract. */
export function exactStandardCombinationEntryProducts(value:unknown):StandardCombinationEntryProduct[]{
 if(!Array.isArray(value)||!value.length||value.length>4||new Set(value).size!==value.length
  ||value.some(p=>!['TRAINING','SURVEY','SCHOOL','TEACHER'].includes(p)))
  throw new AdminPermissionError(400,'批准时必须明确选择允许的入口，且不能重复')
 return [...value].sort() as StandardCombinationEntryProduct[]
}
export async function approveToolEntryPolicies(tx:Prisma.TransactionClient,identity:PolicyIdentity,rawProducts:unknown,actorId:string,reason:string){
 const products=exactToolEntryProducts(rawProducts)
 return writeEntryPolicies(tx,identity,products,actorId,reason)
}
export async function approveStandardCombinationEntryPolicies(tx:Prisma.TransactionClient,identity:PolicyIdentity,rawProducts:unknown,actorId:string,reason:string){
 if(!/^standard-release:[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(identity.resourceKey)
  ||!/^[a-f0-9]{64}$/.test(identity.fingerprint))throw new AdminPermissionError(400,'教育入口批准必须指向精确标准组合')
 return writeEntryPolicies(tx,identity,exactStandardCombinationEntryProducts(rawProducts),actorId,reason)
}
/** The system profile publisher supplies the server-resolved artifact hash.
 * Approval never grants a recipient use or asserts an entry adapter is ready. */
export async function approveCognitiveProfileEntryPolicies(tx:Prisma.TransactionClient,identity:PolicyIdentity,rawProducts:unknown,actorId:string,reason:string){
 if(!/^cognitive-profile:[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}:(experience|standard|research)$/i.test(identity.resourceKey)
  ||!/^[a-f0-9]{64}$/.test(identity.fingerprint))throw new AdminPermissionError(400,'认知入口批准必须指向精确配置和 profile')
 return writeEntryPolicies(tx,identity,exactStandardCombinationEntryProducts(rawProducts),actorId,reason)
}
async function writeEntryPolicies<T extends StandardCombinationEntryProduct>(tx:Prisma.TransactionClient,identity:PolicyIdentity,products:T[],actorId:string,reason:string){
 await lockToolPolicyMutation(tx,[identity])
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
export async function assertToolEntryPolicy(tx:Prisma.TransactionClient,identity:PolicyIdentity,product:StandardCombinationEntryProduct){
 const policy=await readToolPolicy(tx,identity,'ADMISSION_READ',product)
 if(policy.decision!=='APPROVED'||policy.paused)throw new AdminPermissionError(409,'该精确版本未获本入口准入或已停止新增使用：'+product+'；'+policy.reason)
 return policy
}
