import {z} from 'zod'
import {canonicalHash} from '../assessment-runtime/canonical'
import {selectedConfigurationPointerSchema} from '../assessment-authorization/standard-configuration-binding'
import {privateToolFail} from './private-tool.contracts'
import {educationPublicSourceKey} from './public-source.identity'

export type SelectedSourcePointer=z.infer<typeof selectedConfigurationPointerSchema>
export type SelectedSourceBindings=ReadonlyMap<string,readonly SelectedSourcePointer[]>
const sourceSchema=z.object({provider:z.literal('STANDARD_SCALE'),versionId:z.string().guid(),
 contentHash:z.string().regex(/^[a-f0-9]{64}$/),selectedBinding:selectedConfigurationPointerSchema}).strict()

/** Headers projected from the original immutable version, never the latest
 * grant or a current default. No executable/report body is needed at START. */
export function readSelectedSourceBindings(raw:unknown,acrossVersions=false):SelectedSourceBindings{
 const sources=z.array(sourceSchema).max(acrossVersions?6400:50).parse(raw)
 const result=new Map<string,SelectedSourcePointer[]>()
 for(const source of sources){
  const key=educationPublicSourceKey({kind:'STANDARD_SCALE',id:source.versionId,hash:source.contentHash}),prior=result.get(key)
  if(prior?.some(value=>canonicalHash(value)===canonicalHash(source.selectedBinding)))continue
  if(prior&&!acrossVersions)privateToolFail('SELECTED_CONFIGURATION_CONFLICT',409)
  result.set(key,[...(prior??[]),source.selectedBinding])
 }
 return result
}
export function selectedSourceBindingsFromBlocks(blocks:ReadonlyArray<{source:{provider:string;versionId:string;contentHash:string;selectedBinding?:SelectedSourcePointer}}>):SelectedSourceBindings{
 return readSelectedSourceBindings(blocks.flatMap(({source})=>source.provider==='STANDARD_SCALE'&&source.selectedBinding?
  [{provider:source.provider,versionId:source.versionId,contentHash:source.contentHash,selectedBinding:source.selectedBinding}]:[]))
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
