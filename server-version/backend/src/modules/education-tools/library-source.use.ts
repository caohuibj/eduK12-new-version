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

/** Owner-scoped source IDs only. No draft instructions/questions are downloaded
 * and no role decision or mutable draft content is reused as write authority. */
export async function lockOwnedDraftLibraryUses(tx:Prisma.TransactionClient,c:PrivateToolContext,toolId:string){
 const rows=await tx.$queryRaw<Array<{id:string}>>(Prisma.sql`SELECT DISTINCT b#>>'{source,versionId}' AS id
  FROM education_private_tools d CROSS JOIN LATERAL jsonb_array_elements(d.definition->'blocks') b
  WHERE d.id=${toolId} AND d.kind='COMPOSITION' AND d.entry=${c.entry} AND d.organization_id=${c.organizationId}
   AND d.owner_user_id=${c.principal.userId} AND b#>>'{source,provider}'='LIBRARY_SCALE'`)
 return rows.length?lockEducationLibraryUses(tx,c,rows.map(row=>row.id)):undefined
}
