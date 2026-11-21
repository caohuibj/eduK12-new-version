import {Prisma} from '@prisma/client'
import {lockInstrumentSourceIdentity} from '../assessment-authorization/source-identity-lock'
import {situationalReleaseKey} from '../situational/situational-release.service'
import {validateStaticSjtRegistryMappings} from '../situational/static-measurement-release'
import {privateToolFail,type PrivateToolContext} from './private-tool.contracts'

const locked=new WeakMap<object,Set<string>>()
/** Source advisory identities precede Users/organization/source-row locks.
 * Hint reads order locks only; ownership/U/current source are checked later. */
export async function lockEducationNativeSourceIds(tx:Prisma.TransactionClient,ids:readonly string[]){
 const exact=[...new Set(ids)];if(!exact.length)return
 if(exact.length>50)privateToolFail('EDUCATION_NATIVE_INPUT_INVALID',400)
 const identities=await tx.$queryRaw<Array<{id:string;instrumentKey:string;instrumentVersion:string;kind:'AUTHOR'|'STATIC'}>>(Prisma.sql`
  SELECT id,instrument_key AS "instrumentKey",instrument_version AS "instrumentVersion",'AUTHOR'::text AS kind FROM sjt_author_releases WHERE id=ANY(${exact}::text[])
  UNION ALL SELECT id,instrument_key,instrument_version,'STATIC'::text FROM static_sjt_measurement_mappings WHERE id=ANY(${exact}::text[])`)
 for(const identity of [...identities].sort((a,b)=>situationalReleaseKey(a).localeCompare(situationalReleaseKey(b))))await lockInstrumentSourceIdentity(tx,identity,'READ')
 const staticIds=identities.filter(identity=>identity.kind==='STATIC').map(identity=>identity.id)
 if(staticIds.length)await validateStaticSjtRegistryMappings(tx,staticIds)
 let values=locked.get(tx);if(!values){values=new Set();locked.set(tx,values)}
 for(const id of identities.map(identity=>identity.id))values.add(id)
}
export function assertEducationNativeSourceLocks(tx:Prisma.TransactionClient,ids:readonly string[]){
 if(ids.some(id=>!locked.get(tx)?.has(id)))privateToolFail('EDUCATION_NATIVE_SOURCE_CHANGED_RETRY',409)
}
export async function lockOwnedDraftNativeSources(tx:Prisma.TransactionClient,c:PrivateToolContext,toolId:string){
 const rows=await tx.$queryRaw<Array<{id:string}>>(Prisma.sql`SELECT b#>>'{source,versionId}' AS id FROM education_private_tools d
  CROSS JOIN LATERAL jsonb_array_elements(d.definition->'blocks') b
  WHERE d.id=${toolId} AND d.entry=${c.entry} AND d.organization_id=${c.organizationId} AND d.owner_user_id=${c.principal.userId}
   AND d.kind='COMPOSITION' AND b#>>'{source,provider}'='SJT_RELEASE'`)
 await lockEducationNativeSourceIds(tx,rows.map(row=>row.id))
}
