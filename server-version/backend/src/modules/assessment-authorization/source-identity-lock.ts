import {Prisma} from '@prisma/client'
/** The exact source identity serializes new authorization lineages as well as
 * updates to existing ones. Lock order: source identities (key/version sorted)
 * -> registry mappings -> caller User/grant locks -> authorization rows -> release.
 * Authorization writers take only source EXCLUSIVE -> authorization locks; never
 * acquire User/grant or release locks while holding a source writer lock. */
export async function lockInstrumentSourceIdentity(tx:Prisma.TransactionClient,identity:{instrumentKey:string;instrumentVersion:string},mode:'READ'|'WRITE'){
 const key=JSON.stringify(['instrument-source-v1',identity.instrumentKey,identity.instrumentVersion])
 if(mode==='WRITE')await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${key},0))`)
 else await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock_shared(hashtextextended(${key},0))`)
}
/** Identity is immutable across versions of one authorization lineage. Read it
 * without row locks first, then re-read latest version under the source lock. */
export async function lockAuthorizationSource(tx:Prisma.TransactionClient,authorizationKey:string){
 const identity=await tx.instrumentAuthorization.findFirst({where:{authorizationKey},select:{instrumentKey:true,instrumentVersion:true},orderBy:{version:'desc'}})
 if(identity)await lockInstrumentSourceIdentity(tx,identity,'WRITE')
}
