import {Prisma} from '@prisma/client'
import {EDUCATION_STANDARD_USE_ACTION,educationStandardUseMetadata} from '../assessment-authorization/education-standard-use'
import {readEducationStandardCurrentEvidence,educationStandardEvidenceCurrent,type EducationUseHeader} from '../assessment-authorization/education-standard-use-current'
import {selectedConfigurationPointer} from '../assessment-authorization/standard-configuration-binding'
import type {PrivateToolContext} from './private-tool.contracts'
import {parseEducationPublicSourceKey} from './public-source.identity'

export type TypedCatalogUse=EducationUseHeader&{version:number;actor_id:string;metadata:unknown;valid_from:string|Date;expires_at:string|Date}
export type SelectedCatalogFacts={key:string;typedUses:TypedCatalogUse[];legacyUseAvailable:boolean;typedOverflow:boolean;catalogReadAt:Date}
/** One bounded same-tool peer batch and one authority batch for the page. No source compilation, executable
 * body, persistent permission cache or per-card query. Overflow is explicit;
 * it must never turn an unseen typed grant into a legacy entitlement. */
export async function selectedEducationCatalogChoices(tx:Prisma.TransactionClient,c:PrivateToolContext,rows:readonly SelectedCatalogFacts[]){
 let uses=[...new Map(rows.flatMap(row=>row.typedUses).map(use=>[use.id,use])).values()]
 let overflow=rows.some(row=>row.typedOverflow)||uses.length>128
 if(!overflow&&uses.length){
  const ids=rows.flatMap(row=>{const source=parseEducationPublicSourceKey(row.key);return source?.kind==='STANDARD_SCALE'?[source.id]:[]})
  const configs=rows.flatMap(row=>{const source=parseEducationPublicSourceKey(row.key);return source?.kind==='COGNITIVE_PROFILE'?[source.id]:[]})
  uses=await tx.$queryRaw<TypedCatalogUse[]>(Prisma.sql`SELECT g.id,g.subject_id,g.issuer_id,g.resource_keys,g.version,g.valid_from,g.expires_at,e.actor_id,e.metadata
   FROM content_capability_grants g JOIN assessment_management_events e ON e.id=g.id AND e.action=${EDUCATION_STANDARD_USE_ACTION}
   WHERE g.subject_id=${c.principal.userId} AND g.product=${c.entry} AND g.scope_kind='ORGANIZATION' AND g.scope_id=${c.organizationId}
    AND g.resource_kind='material' AND g.capabilities=ARRAY['material.use']::text[] AND g.parent_grant_id IS NULL AND g.ancestry=ARRAY[g.id]::text[]
    AND g.remaining_delegation_depth=0 AND g.delegable_capabilities=ARRAY[]::text[] AND g.revoked_at IS NULL
    AND g.valid_from<=clock_timestamp() AT TIME ZONE 'UTC' AND g.expires_at>clock_timestamp() AT TIME ZONE 'UTC'
    AND (e.metadata#>>'{selectedBinding,binding,configuration,configId}'=ANY(${configs}::text[]) OR EXISTS(
     SELECT 1 FROM survey_standard_releases s JOIN measurement_content_releases m ON m.id=s.measurement_release->>'releaseId' AND m.layer='MEASUREMENT' AND m.family='SCALE' AND m.status='PUBLISHED' AND m.content_hash=s.measurement_release->>'contentHash'
     JOIN scales native ON native.code=s.tool_key AND native.instrument_version=s.snapshot->>'instrumentVersion' AND native.status='PUBLISHED' AND native.instrument_class='STANDARD' AND native.library_entry_id IS NULL
     WHERE s.state='ONLINE' AND g.resource_keys=ARRAY['education-source:STANDARD_SCALE:'||s.id||':'||s.combination_hash]::text[] AND s.tool_key IN (SELECT tool_key FROM survey_standard_releases WHERE id=ANY(${ids}::text[]))))
   ORDER BY g.id LIMIT 129`)
  overflow=uses.length>128
 }
 const evidence=overflow?new Map():await readEducationStandardCurrentEvidence(tx,c,uses,false,uses.map(use=>({id:use.id,actor_id:use.actor_id,metadata:use.metadata})))
 const choices=new Map<string,Array<{configurationName:string|null;selectedBinding:ReturnType<typeof selectedConfigurationPointer>;ambiguous:boolean}>>()
 const catalogNow=Math.max(0,...rows.map(row=>row.catalogReadAt.getTime()))
 const all=overflow?[]:uses.flatMap(use=>{
   const current=evidence.get(use.id)
   if(!current||current.binding.binding.authorization.revision!==use.version)return []
   const now=new Date(Math.max(catalogNow,current.authority?.readAt.getTime()??0))
   const validFrom=use.valid_from instanceof Date?use.valid_from:new Date(use.valid_from),expiresAt=use.expires_at instanceof Date?use.expires_at:new Date(use.expires_at)
   if(!educationStandardEvidenceCurrent(current,now)||validFrom>now||expiresAt<=now)return []
   const configuration=current.binding.binding.configuration
   return [{key:use.resource_keys[0],toolKey:configuration.kind==='STANDARD_COMBINATION'?configuration.toolKey:'cognitive:'+configuration.configId,configurationName:educationStandardUseMetadata.parse(use.metadata).configurationName??null,
    selectedBinding:selectedConfigurationPointer(current.binding),ambiguous:false}]
  })
 for(const item of all){
  const peers=all.filter(other=>other.toolKey===item.toolKey)
  item.ambiguous=peers.length>1&&(!item.configurationName||peers.filter(other=>other.configurationName===item.configurationName).length>1)
 }
 for(const row of rows)choices.set(row.key,all.filter(item=>item.key===row.key).map(item=>({configurationName:item.configurationName,selectedBinding:item.selectedBinding,ambiguous:item.ambiguous})))
 return {choices,overflow}
}
