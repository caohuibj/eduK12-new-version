import {Prisma} from '@prisma/client'
import {privateToolFail,type PrivateToolContext} from './private-tool.contracts'
import {readEducationLibrarySourceUses,type EducationLibrarySourceUse} from './library-source.catalog'

export type LockedEducationLibraryUses={readonly kind:'LOCKED_EDUCATION_LIBRARY_U'}
type Facts={tx:Prisma.TransactionClient;scope:string;uses:ReadonlyMap<string,EducationLibrarySourceUse>}
const locked=new WeakMap<LockedEducationLibraryUses,Facts>()
const scope=(c:PrivateToolContext)=>JSON.stringify([c.entry,c.organizationId,c.principal.userId])

/** Same-transaction locked facts, never a serializable grant/receipt or cache.
 * Select all external issuer accounts before taking the receiver org mutex.
 * Actual author/workflow checks still run in their existing protected layer. */
export async function lockEducationLibraryUses(tx:Prisma.TransactionClient,c:PrivateToolContext,entryIds:readonly string[]){
 const uses=await readEducationLibrarySourceUses(tx,c,entryIds,{lockForUse:true})
 const proof:LockedEducationLibraryUses=Object.freeze({kind:'LOCKED_EDUCATION_LIBRARY_U'})
 locked.set(proof,{tx,scope:scope(c),uses})
 return proof
}
export function readLockedEducationLibraryUses(tx:Prisma.TransactionClient,c:PrivateToolContext,proof:LockedEducationLibraryUses|undefined){
 const facts=proof&&locked.get(proof)
 if(!facts||facts.tx!==tx||facts.scope!==scope(c))privateToolFail('LIBRARY_SOURCE_LOCK_CONTEXT_REQUIRED')
 return facts.uses
}

/** Late wall-clock fence only. Locked account/grant facts stay valid through
 * commit; never repeat the issuer chain after potentially long row waits. */
export async function assertLockedLibraryUseTime(tx:Prisma.TransactionClient,proof?:LockedEducationLibraryUses){
 if(!proof)return
 const facts=locked.get(proof)
 if(!facts||facts.tx!==tx)privateToolFail('LIBRARY_SOURCE_LOCK_CONTEXT_REQUIRED')
 const deadlines=[...facts.uses.values()].flatMap(use=>use.expiresAt?[use.expiresAt]:[])
 if(!deadlines.length)return
 const [clock]=await tx.$queryRaw<Array<{now:Date}>>`SELECT clock_timestamp() AS now`
 if(deadlines.some(date=>date<=clock.now))privateToolFail('LIBRARY_SOURCE_USE_EXPIRED',403)
}

/** Exact owned immutable questionnaires plus any legacy entry IDs in the same
 * batch. All issuer/ancestor Users are selected together before the org fence. */
export async function lockCompositionLibraryUses(tx:Prisma.TransactionClient,c:PrivateToolContext,keys:readonly string[],additionalEntryIds:readonly string[]=[]){
 const rows=keys.length?await tx.$queryRaw<Array<{id:string}>>(Prisma.sql`SELECT DISTINCT b->>'versionId' AS id
  FROM composite_assessments parent JOIN education_private_tool_versions v ON parent.creation_key=
   'education-composition:'||v.entry||':'||v.id||':'||(v.definition#>>'{administration,population}')||':'||(v.definition#>>'{administration,responseMode}')||':'||(v.definition->>'adapterVersion')
  CROSS JOIN LATERAL jsonb_array_elements(parent.training_content_snapshot#>'{educationBinding,manifest}') b
  WHERE parent.creation_key IN (${Prisma.join([...new Set(keys)])}) AND v.entry=${c.entry} AND v.organization_id=${c.organizationId}
   AND v.owner_user_id=${c.principal.userId} AND b->>'sourceProvider'='LIBRARY_SCALE'`):[]
 const ids=[...new Set([...additionalEntryIds,...rows.map(row=>row.id)])]
 return ids.length?lockEducationLibraryUses(tx,c,ids):undefined
}

export async function assertEducationLibraryUses(tx:Prisma.TransactionClient,c:PrivateToolContext,entryIds:readonly string[],options:{locked?:LockedEducationLibraryUses;requireLocked?:boolean}={}){
 const ids=[...new Set(entryIds)];if(!ids.length)return
 const uses=options.locked||options.requireLocked?readLockedEducationLibraryUses(tx,c,options.locked):await readEducationLibrarySourceUses(tx,c,ids)
 if(ids.some(id=>!uses.has(id)))privateToolFail('LIBRARY_SOURCE_USE_REQUIRED',403)
 const deadlines=ids.flatMap(id=>{const date=uses.get(id)!.expiresAt;return date?[date]:[]})
 if(deadlines.length){
  const [clock]=await tx.$queryRaw<Array<{now:Date}>>`SELECT clock_timestamp() AS now`
  if(deadlines.some(date=>date<=clock.now))privateToolFail('LIBRARY_SOURCE_USE_EXPIRED',403)
 }
}

/** Owner-scoped source IDs only. No draft instructions/questions are downloaded
 * and no role decision or mutable draft content is reused as write authority. */
export async function lockOwnedDraftLibraryUses(tx:Prisma.TransactionClient,c:PrivateToolContext,toolId:string){
 const rows=await tx.$queryRaw<Array<{id:string}>>(Prisma.sql`SELECT DISTINCT b#>>'{source,versionId}' AS id
  FROM education_private_tools d CROSS JOIN LATERAL jsonb_array_elements(d.definition->'blocks') b
  WHERE d.id=${toolId} AND d.kind='COMPOSITION' AND d.entry=${c.entry} AND d.organization_id=${c.organizationId}
   AND d.owner_user_id=${c.principal.userId} AND b#>>'{source,provider}'='LIBRARY_SCALE'`)
 return rows.length?lockEducationLibraryUses(tx,c,rows.map(row=>row.id)):undefined
}
