import {z} from 'zod'
import {canonicalHash} from '../assessment-runtime/canonical'
import {selectedConfigurationPointerSchema} from '../assessment-authorization/standard-configuration-binding'
import {privateToolFail} from './private-tool.contracts'
import {educationPublicSourceKey} from './public-source.identity'

export type SelectedSourcePointer=z.infer<typeof selectedConfigurationPointerSchema>
export type SelectedSourceBindings=ReadonlyMap<string,readonly SelectedSourcePointer[]>
const sourceSchema=z.object({provider:z.enum(['STANDARD_SCALE','COGNITIVE_CONFIG']),versionId:z.string().guid(),
 contentHash:z.string().regex(/^[a-f0-9]{64}$/),artifactHash:z.string().regex(/^[a-f0-9]{64}$/).optional(),selectedBinding:selectedConfigurationPointerSchema}).strict()
 .superRefine((source,ctx)=>{if((source.provider==='COGNITIVE_CONFIG')!==Boolean(source.artifactHash))ctx.addIssue({code:'custom',message:'SELECTED_CONFIGURATION_SOURCE_KIND'})})
const changeSourceSchema=z.object({blockId:z.string().guid(),source:sourceSchema}).strict()
const sourceKey=(s:z.infer<typeof sourceSchema>)=>educationPublicSourceKey({kind:s.provider==='STANDARD_SCALE'?'STANDARD_SCALE':'COGNITIVE_PROFILE',id:s.versionId,hash:s.artifactHash??s.contentHash})

/** Headers projected from the original immutable version, never the latest
 * grant or a current default. No executable/report body is needed at START. */
export function readSelectedSourceBindings(raw:unknown,acrossVersions=false):SelectedSourceBindings{
 const sources=z.array(sourceSchema).max(acrossVersions?6400:50).parse(raw)
 const result=new Map<string,SelectedSourcePointer[]>()
 for(const source of sources){
  const key=sourceKey(source),prior=result.get(key)
  if(prior?.some(value=>canonicalHash(value)===canonicalHash(source.selectedBinding)))continue
  if(prior&&!acrossVersions)privateToolFail('SELECTED_CONFIGURATION_CONFLICT',409)
  result.set(key,[...(prior??[]),source.selectedBinding])
 }
 return result
}
export function selectedSourceBindingsFromBlocks(blocks:ReadonlyArray<{source:{provider:string;versionId:string;contentHash:string;artifactHash?:string;selectedBinding?:SelectedSourcePointer}}>):SelectedSourceBindings{
 return readSelectedSourceBindings(blocks.flatMap(({source})=>(source.provider==='STANDARD_SCALE'||source.provider==='COGNITIVE_CONFIG')&&source.selectedBinding?
  [{provider:source.provider,versionId:source.versionId,contentHash:source.contentHash,...(source.artifactHash?{artifactHash:source.artifactHash}:{}),selectedBinding:source.selectedBinding}]:[]))
}
/** Keeping a block means keeping its T2 identity. Explicit replacement removes
 * that block and adds a new one; an ordinary draft edit cannot erase its pin. */
export function assertSelectedSourceBindingsUnchanged(previous:ReadonlyArray<{blockId:string;source:unknown}>,next:ReadonlyArray<{blockId:string;source:unknown}>){
 for(const block of previous){
  const source=block.source as {selectedBinding?:unknown},replacement=next.find(value=>value.blockId===block.blockId)
  if(source.selectedBinding!==undefined&&replacement&&canonicalHash(replacement.source)!==canonicalHash(source))
   privateToolFail('SELECTED_CONFIGURATION_REPLACEMENT_REQUIRED',409)
 }
}

/** Draft audit facts only. Reordering/text edits are not a source replacement;
 * explicit slot removal/addition keeps both exact original identities. Bodies,
 * report prose, current permissions and latest defaults are never copied. */
export function selectedSourceBindingChanges(previous:ReadonlyArray<{blockId:string;source:unknown}>,next:ReadonlyArray<{blockId:string;source:unknown}>){
 const project=(blocks:typeof previous)=>z.array(changeSourceSchema).max(50).parse(blocks.flatMap(block=>{
  if(!block.source||typeof block.source!=='object')return []
  const s=block.source as Record<string,unknown>
  return ['STANDARD_SCALE','COGNITIVE_CONFIG'].includes(s.provider as string)&&s.selectedBinding!==undefined?[{blockId:block.blockId,source:{provider:s.provider,versionId:s.versionId,contentHash:s.contentHash,...(s.artifactHash?{artifactHash:s.artifactHash}:{}),selectedBinding:s.selectedBinding}}]:[]
 })).map(({blockId,source})=>({blockId,...source})).sort((a,b)=>a.blockId<b.blockId?-1:a.blockId>b.blockId?1:0)
 const before=project(previous),after=project(next),oldIds=new Set(before.map(value=>canonicalHash(value))),newIds=new Set(after.map(value=>canonicalHash(value)))
 const removed=before.filter(value=>!newIds.has(canonicalHash(value))),added=after.filter(value=>!oldIds.has(canonicalHash(value)))
 return removed.length||added.length?{removed,added}:null
}
