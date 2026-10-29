import {describe,it,expect} from 'vitest'
import {readSelectedSourceBindings,selectedSourceBindingsFromBlocks,assertSelectedSourceBindingsUnchanged,selectedSourceBindingChanges} from '../../modules/education-tools/selected-source-binding'
import {privateCompositionSourceSchema} from '../../modules/education-tools/private-tool.composition-contracts'
import {privateToolContentHash} from '../../modules/education-tools/private-tool.definition'
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
const pointer={bindingHash:'a'.repeat(64),configurationHash:'b'.repeat(64),authorizationId:id(1),authorizationRevision:1}
const source={provider:'STANDARD_SCALE',versionId:id(2),contentHash:'c'.repeat(64),selectedBinding:pointer}
describe('education immutable selected source pointer',()=>{
 it('keeps an old source unchanged and admits only a complete exact standard pointer',()=>{
  const legacy={...source,kind:'SCALE',selectedBinding:undefined}
  expect(privateCompositionSourceSchema.parse(legacy)).toEqual(legacy)
  expect(privateCompositionSourceSchema.parse({...source,kind:'SCALE'})).toMatchObject({selectedBinding:pointer})
  for(const selectedBinding of [null,{...pointer,authorizationRevision:0},{...pointer,bindingHash:'latest'},{...pointer,profile:'experience'}])
   expect(privateCompositionSourceSchema.safeParse({...source,kind:'SCALE',selectedBinding}).success).toBe(false)
  expect(privateCompositionSourceSchema.safeParse({...source,kind:'SCALE',provider:'PRIVATE_VERSION'}).success).toBe(false)
 })
 it('deduplicates repeated blocks but refuses two authorization choices for one source inside a version',()=>{
  const blocks=[{source},{source:{...source}}]
  expect(selectedSourceBindingsFromBlocks(blocks).get(`education-source:STANDARD_SCALE:${source.versionId}:${source.contentHash}`)).toEqual([pointer])
  expect(()=>readSelectedSourceBindings([source,{...source,selectedBinding:{...pointer,authorizationRevision:2}}])).toThrow()
  expect(selectedSourceBindingsFromBlocks([{source:{...source,selectedBinding:undefined}}]).size).toBe(0)
 })
 it('retains independent original revisions when several immutable versions are checked in one batch',()=>{
  const second={...pointer,authorizationId:id(3),bindingHash:'d'.repeat(64)}
  expect([...readSelectedSourceBindings([source,{...source,selectedBinding:second}],true).values()]).toEqual([[pointer,second]])
 })
 it('requires explicit block replacement to remove a pin or change the source, while preserving unrelated draft edits',()=>{
  const original=[{blockId:id(4),source}]
  for(const changed of [{...source,selectedBinding:undefined},{...source,versionId:id(5)},
   {...source,selectedBinding:{...pointer,authorizationRevision:2}}])
   expect(()=>assertSelectedSourceBindingsUnchanged(original,[{blockId:id(4),source:changed}])).toThrow()
  const edited=[{blockId:id(4),source,instruction:'Updated transition'}]
  expect(()=>assertSelectedSourceBindingsUnchanged(original,edited)).not.toThrow()
  expect(()=>assertSelectedSourceBindingsUnchanged(original,[])).not.toThrow()
 })
 it('binds the chosen authorization into the existing immutable private-version content hash',()=>{
  const definition={blocks:[{blockId:id(4),source}]}
  expect(privateToolContentHash('COMPOSITION','Fixed',definition)).not.toBe(privateToolContentHash('COMPOSITION','Fixed',{
   blocks:[{blockId:id(4),source:{...source,selectedBinding:{...pointer,authorizationRevision:2}}}]}))
 })
})
describe('education selected-source change audit facts',()=>{
 it('ignores plain edits, reordering and legacy sources without manufacturing a binding',()=>{
  const blocks=[{blockId:id(4),source},{blockId:id(5),source:{...source,selectedBinding:undefined}}]
  const edited={...blocks[0],instruction:'Changed prose'}
  expect(selectedSourceBindingChanges(blocks,[blocks[1],edited])).toBeNull()
  expect(selectedSourceBindingChanges([{blockId:id(4),source:{...source,selectedBinding:undefined}}],[])).toBeNull()
 })
 it('records exact removed and added slot identities, without carrying unrelated executable or report content',()=>{
  const next={...source,versionId:id(8),selectedBinding:{...pointer,authorizationId:id(9),bindingHash:'d'.repeat(64)}}
  expect(selectedSourceBindingChanges([{blockId:id(4),source:{...source,report:'never copy'}}],[{blockId:id(5),source:next}])).toEqual({
   removed:[{blockId:id(4),...source}],added:[{blockId:id(5),...next}]})
 })
 it('records explicit add/drop independently and rejects a provided malformed pointer',()=>{
  const block={blockId:id(4),source}
  expect(selectedSourceBindingChanges([],[block])).toEqual({removed:[],added:[{blockId:id(4),...source}]})
  expect(selectedSourceBindingChanges([block],[])).toEqual({removed:[{blockId:id(4),...source}],added:[]})
  expect(()=>selectedSourceBindingChanges([block],[{...block,source:{...source,selectedBinding:null}}])).toThrow()
 })
})
