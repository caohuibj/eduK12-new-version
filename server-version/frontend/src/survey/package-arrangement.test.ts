import {describe,expect,it} from 'vitest'
import {moveArrangementUnit,packageArrangement,packageFlowProblems,packageFlowChangeAllowed,planPackageSelection,restorePackage,type PackageMembership} from './package-arrangement'
import type {FlowDraft} from './flow.client'
const pack=(id:string,ids:string[]):PackageMembership=>({id,title:'Same title',family:'BUNDLE',hash:'a'.repeat(64),status:'ACTIVE',version:1,expiresAt:null,bindings:ids.map(draftId=>({draftId,slotKey:draftId,instrumentKey:draftId})),availability:{ready:true,reasons:[],requiresFreshCheck:true}})
const a=pack('instance-a',['a','b']),b=pack('instance-b',['x','y']),same=pack('instance-c',['u','v']),packages=[a,b,same]
const ids=['a','b','c','x','y','u','v'],tools=ids.map(id=>({id,instrumentKey:id})),flow=(keys=ids):FlowDraft=>({schemaVersion:1,embeddedData:[{key:'keep',type:'STRING',source:'STATIC',value:'unchanged'}],blocks:keys.map(instrumentKey=>({blockKey:'block_'+instrumentKey,kind:'INSTRUMENT',instrumentKey}))})
describe('whole package editor plans use import identity without authority side effects',()=>{
 it('keeps two packages and two instances of the same version separate',()=>{
  expect(packageArrangement(ids,packages).map(g=>[g.id,g.ids])).toEqual([['instance-a',['a','b']],['c',['c']],['instance-b',['x','y']],['instance-c',['u','v']]])
 })
 it('moves whole instances and allows ordinary tools between packages',()=>{
  expect(moveArrangementUnit(ids,packages,'c',1)).toEqual(['a','b','x','y','c','u','v'])
  expect(moveArrangementUnit(ids,packages,'instance-a',1)).toEqual(['c','a','b','x','y','u','v'])
 })
 it.each([['b','c'],['b','c','a'],['a','c','b']])('does not silently change damaged draft %j',(...selected)=>{
  const before=[...selected]
  expect(packageArrangement(selected,[a]).some(p=>p.issues.length>0)).toBe(true)
  expect(selected).toEqual(before);expect(restorePackage(selected,a)).toEqual(['a','b','c'])
 })
 it('preserves invalid authority hints when explicitly restoring approved membership',()=>{
  const revoked={...a,availability:{ready:false,reasons:['授权已撤销'],requiresFreshCheck:true}}
  const plan=planPackageSelection(['b','c'],restorePackage(['b','c'],revoked),[revoked],tools,null)
  expect(plan.ids).toEqual(['a','b','c']);expect(revoked.availability.ready).toBe(false)
 })
 it('removes only the selected package instance and retains all unrelated blocks/settings',()=>{
  const original=flow(),next=ids.filter(id=>!a.bindings.some(b=>b.draftId===id)),plan=planPackageSelection(ids,next,packages,tools,original)
  expect(plan.error).toBeUndefined();expect(plan.flow?.embeddedData).toEqual(original.embeddedData)
  expect(plan.flow?.blocks.map(b=>b.instrumentKey)).toEqual(['c','x','y','u','v']);expect(original.blocks).toHaveLength(7)
 })
 it('permits the existing unconditional material inside a valid package',()=>{
  const f=flow(['a','b','c']);f.blocks.splice(1,0,{blockKey:'material',kind:'MATERIAL',title:'Synthetic',body:'Legal material'})
  expect(packageFlowProblems(f,[a])).toEqual([])
  const plan=planPackageSelection(['a','b','c'],['c','a','b'],[a],tools,f)
  expect(plan.error).toContain('材料');expect(plan.flow).toBe(f);expect(plan.ids).toEqual(['a','b','c'])
 })
 it('moves ordinary units within one material region without moving its barrier',()=>{
  const f=flow(['a','b','c','x']);f.blocks.splice(2,0,{blockKey:'material',kind:'MATERIAL',title:'Synthetic',body:'Keep exactly here'})
  const plan=planPackageSelection(['a','b','c','x'],['a','b','x','c'],[a],tools,f)
  expect(plan.error).toBeUndefined();expect(plan.flow?.blocks[2]).toBe(f.blocks[2])
 })
 it('rejects direct Flow member edits, external insertion, missing members, conditions and experiments',()=>{
  const original=flow(['a','b','c'])
  for(const next of [flow(['b','a','c']),flow(['a','c','b']),flow(['a','c']),{...original,blocks:original.blocks.map((b,i)=>i?b:{...b,when:{op:'IS_MISSING',field:{source:'EMBEDDED',key:'x'}}})} as FlowDraft,{...original,experiment:{experimentKey:'exp',linkedPolicy:'RERANDOMIZE',groups:[]}} as FlowDraft])expect(packageFlowChangeAllowed(original,next,[a])).toBe(false)
 })
 it('preserves an ambiguous damaged material draft instead of deleting other blocks',()=>{
  const f=flow(['b','c','a']);f.blocks.splice(1,0,{blockKey:'material',kind:'MATERIAL',title:'Synthetic',body:'Ambiguous'})
  const plan=planPackageSelection(['b','c','a'],['a','b','c'],[a],tools,f)
  expect(plan.error).toContain('材料');expect(plan.flow).toBe(f);expect(f.blocks).toHaveLength(4)
 })
 it('allows data-only edits on a damaged Flow but cannot insert more tools into its broken package',()=>{
  const broken=flow(['a','c'])
  expect(packageFlowChangeAllowed(broken,{...broken,embeddedData:[]},[a])).toBe(true)
  expect(packageFlowChangeAllowed(broken,flow(['a','x','c']),[a])).toBe(false)
 })
 describe.each([false,true])('premerge recovery with Flow=%s',withFlow=>{
  const selected=['a','c','x'],damaged=[a,b]
  const original=()=>{if(!withFlow)return null;const f=flow(selected);f.blocks.splice(2,0,{blockKey:'material',kind:'MATERIAL',title:'Synthetic',body:'Keep this barrier'});return f}
  it.each([
   ['restore A',()=>restorePackage(selected,a),['a','b','c','x']],
   ['remove A',()=>['c','x'],['c','x']],
   ['restore B',()=>restorePackage(selected,b),['a','c','x','y']],
   ['remove B',()=>['a','c'],['a','c']],
  ] as const)('can %s while leaving the other damaged instance unchanged',(_action,next,expected)=>{
   const f=original(),plan=planPackageSelection(selected,next(),damaged,tools,f)
   expect(plan.error).toBeUndefined();expect(plan.ids).toEqual(expected);expect(selected).toEqual(['a','c','x'])
   if(f){expect(plan.flow?.embeddedData).toEqual(f.embeddedData);expect(plan.flow?.blocks.find(block=>block.kind==='MATERIAL')).toBe(f.blocks[2])}
  })
  it('explicitly restores both instances to a final valid draft without deleting the ordinary tool or material',()=>{
   const f=original(),first=planPackageSelection(selected,restorePackage(selected,a),damaged,tools,f)
   expect(first.error).toBeUndefined()
   const second=planPackageSelection(first.ids,restorePackage(first.ids,b),damaged,tools,first.flow)
   expect(second.error).toBeUndefined();expect(second.ids).toEqual(['a','b','c','x','y'])
   expect(packageArrangement(second.ids,damaged).every(unit=>unit.issues.length===0)).toBe(true)
   expect(packageFlowProblems(second.flow,damaged)).toEqual([])
   if(f){expect(second.flow?.blocks.map(block=>block.instrumentKey??block.kind)).toEqual(['a','b','c','MATERIAL','x','y']);expect(f.blocks.map(block=>block.instrumentKey??block.kind)).toEqual(['a','c','MATERIAL','x'])}
  })
 })
 it('premerge recovery cannot split a valid instance, add a new partial instance or worsen an unresolved interleaving',()=>{
  expect(planPackageSelection(['a','b','x'],['a','x'],[a,b],tools,null).error).toContain('不能新增或加重')
  expect(planPackageSelection(['a'],['a','b','x'],[a,b],tools,null).error).toContain('不能新增或加重')
  expect(planPackageSelection(['a','x','c','y'],['a','b','x','c','d','y'],[a,b],[...tools,{id:'d',instrumentKey:'d'}],null).error).toContain('不能新增或加重')
 })
})
