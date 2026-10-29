import {Prisma} from '@prisma/client'
import {z} from 'zod'
import {canonicalHash} from '../assessment-runtime/canonical'
import {ContentReleaseError} from '../measurement-content/release'
import type {readCurrentStandardCombination} from '../measurement-content/standard-combination-source'
import {sealSelectedConfigurationBinding,readSelectedConfigurationBinding,selectedConfigurationSchema,
 type SelectedConfigurationBinding} from './selected-configuration'

const hash=z.string().regex(/^[a-f0-9]{64}$/),id=z.string().guid(),revision=z.number().int().positive()
export const selectedConfigurationPointerSchema=z.object({bindingHash:hash,configurationHash:hash,authorizationId:id,authorizationRevision:revision}).strict()
type Source=Awaited<ReturnType<typeof readCurrentStandardCombination>>
type SourceIdentity={row:{id:string;combination_hash:string;snapshot:{toolKey:string;instrumentVersion:string;
 parts:Record<'CONTENT'|'PARAMETERS'|'REPORT',{version:string;hash:string}>}};measurement:{releaseId:string;contentHash:string}}
type Authority={useGrantId:string;useGrantVersion:number;issuerId:string}&(
 {authorityEntryGrantId:string;authorityEntryGrantVersion:number}|{authorityGrantId:string})
const fail=(code:string):never=>{throw new ContentReleaseError('SELECTED_CONFIGURATION_'+code)}
export function standardConfigurationIdentity(source:SourceIdentity){
 const t=source.row.snapshot
 return selectedConfigurationSchema.parse({kind:'STANDARD_COMBINATION',toolKey:t.toolKey,instrumentVersion:t.instrumentVersion,
  combinationId:source.row.id,combinationHash:source.row.combination_hash,
  measurement:{releaseId:source.measurement.releaseId,contentHash:source.measurement.contentHash},
  axes:Object.fromEntries(Object.entries(t.parts).map(([axis,part])=>[axis,{version:part.version,hash:part.hash}]))})
}
/** T1 only, after the existing issuer/recipient/current-source checks. Reuses
 * the existing immutable combination and operation audit instead of a table. */
export function sealTrainingStandardUseConfiguration(source:SourceIdentity,userId:string,use:Authority,delegationVersion:number){
 return sealSelectedConfigurationBinding({product:'TRAINING',configuration:standardConfigurationIdentity(source),authorization:{
  kind:'TRAINING_STANDARD_USE',id:use.useGrantId,revision:use.useGrantVersion,issuerId:use.issuerId,recipientId:userId,organizationId:null,
  authority:'authorityEntryGrantId'in use?[{kind:'ENTRY_ADMIN',id:use.authorityEntryGrantId,revision:use.authorityEntryGrantVersion}]:
   [{kind:'CONTENT_DELEGATION',id:use.authorityGrantId,revision:delegationVersion}],
 }})
}
export function selectedConfigurationPointer(value:SelectedConfigurationBinding){
 return selectedConfigurationPointerSchema.parse({bindingHash:value.bindingHash,configurationHash:value.binding.configurationHash,
  authorizationId:value.binding.authorization.id,authorizationRevision:value.binding.authorization.revision})
}

/** An exact revision lookup, never latest. Old grants with no typed T1 evidence
 * remain explicitly legacy; malformed or conflicting evidence cannot fall back.
 * Current authority was checked by the caller, separately from this identity. */
export async function readTrainingStandardUseConfiguration(tx:Prisma.TransactionClient,source:Source,userId:string,use:Authority){
 const rows=await tx.$queryRaw<Array<{selected:unknown;actor_id:string}>>(Prisma.sql`
  SELECT DISTINCT metadata->'selectedBinding' AS selected,actor_id FROM assessment_management_events
  WHERE action='STANDARD_COMBINATION_USE_GRANTED' AND resource_id=${source.row.id}
   AND metadata->>'grantId'=${use.useGrantId} AND metadata->>'useVersion'=${String(use.useGrantVersion)}
   AND metadata?'selectedBinding' ORDER BY actor_id LIMIT 2`)
 if(!rows.length)return null
 if(rows.length!==1||rows[0].actor_id!==use.issuerId)fail('REVISION_CONFLICT')
 let sealed:ReturnType<typeof readSelectedConfigurationBinding>
 try{sealed=readSelectedConfigurationBinding(rows[0].selected,{product:'TRAINING',recipientId:userId,organizationId:null,
  authorizationId:use.useGrantId,authorizationRevision:use.useGrantVersion})}catch{return fail('INVALID_EVIDENCE')}
 if(!sealed||sealed.binding.authorization.issuerId!==use.issuerId||sealed.binding.authorization.kind!=='TRAINING_STANDARD_USE'
  ||canonicalHash(sealed.binding.configuration)!==canonicalHash(standardConfigurationIdentity(source)))return fail('SOURCE_MISMATCH')
 const expected='authorityEntryGrantId'in use?{kind:'ENTRY_ADMIN',id:use.authorityEntryGrantId,revision:use.authorityEntryGrantVersion}:
  {kind:'CONTENT_DELEGATION',id:use.authorityGrantId,revision:1}
 // Capability roots are immutable except a versioned revocation; an available
 // original root is still revision 1. No replacement root can repair a binding.
 if(canonicalHash(sealed.binding.authorization.authority)!==canonicalHash([expected]))fail('AUTHORITY_MISMATCH')
 return sealed
}
