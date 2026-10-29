import {Prisma} from '@prisma/client'
import {educationStandardUseMetadata} from '../assessment-authorization/education-standard-use'
import {readEducationStandardCurrentEvidence,educationStandardEvidenceCurrent,type EducationUseHeader} from '../assessment-authorization/education-standard-use-current'
import {selectedConfigurationPointer} from '../assessment-authorization/standard-configuration-binding'
import type {PrivateToolContext} from './private-tool.contracts'

export type TypedCatalogUse=EducationUseHeader&{version:number;actor_id:string;metadata:unknown;valid_from:string;expires_at:string}
export type SelectedCatalogFacts={key:string;typedUses:TypedCatalogUse[];legacyUseAvailable:boolean;typedOverflow:boolean;catalogReadAt:Date}
/** One bounded authority batch for the page. No source compilation, executable
 * body, persistent permission cache or per-card query. Overflow is explicit;
 * it must never turn an unseen typed grant into a legacy entitlement. */
export async function selectedEducationCatalogChoices(tx:Prisma.TransactionClient,c:PrivateToolContext,rows:readonly SelectedCatalogFacts[]){
 const uses=[...new Map(rows.flatMap(row=>row.typedUses).map(use=>[use.id,use])).values()]
 const overflow=rows.some(row=>row.typedOverflow)||uses.length>128
 const evidence=overflow?new Map():await readEducationStandardCurrentEvidence(tx,c,uses,false,uses.map(use=>({id:use.id,actor_id:use.actor_id,metadata:use.metadata})))
 const choices=new Map<string,Array<{configurationName:string|null;selectedBinding:ReturnType<typeof selectedConfigurationPointer>;ambiguous:boolean}>>()
 for(const row of rows){
  const valid=overflow?[]:row.typedUses.flatMap(use=>{
   const current=evidence.get(use.id)
   if(!current||current.binding.binding.authorization.revision!==use.version)return []
   const now=new Date(Math.max(row.catalogReadAt.getTime(),current.authority?.readAt.getTime()??0))
   if(!educationStandardEvidenceCurrent(current,now)||new Date(use.valid_from)>now||new Date(use.expires_at)<=now)return []
   return [{configurationName:educationStandardUseMetadata.parse(use.metadata).configurationName??null,selectedBinding:selectedConfigurationPointer(current.binding),ambiguous:false}]
  })
  for(const item of valid)item.ambiguous=valid.length>1&&(!item.configurationName||valid.filter(other=>other.configurationName===item.configurationName).length>1)
  choices.set(row.key,valid)
 }
 return {choices,overflow}
}
