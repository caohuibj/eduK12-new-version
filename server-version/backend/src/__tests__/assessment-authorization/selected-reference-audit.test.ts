import {describe,it,expect} from 'vitest'
import {selectedReferenceChanges} from '../../modules/assessment-authorization/selected-reference-audit'
import {addCompositeItemSchema} from '../../modules/composite/composite.schema'
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
const one={slotId:id(1),kind:'STANDARD_COMBINATION' as const,sourceId:id(2),sourceHash:'a'.repeat(64),referenceHash:'b'.repeat(64),
 selectedBinding:{authorizationId:id(3),authorizationRevision:5,configurationHash:'c'.repeat(64),bindingHash:'d'.repeat(64)}}
describe('T2 exact reference audit',()=>{
 it('ignores reorder and empty legacy projections, while retaining deterministic removed/added identities',()=>{
  const two={...one,slotId:id(4),selectedBinding:{...one.selectedBinding,authorizationRevision:7}}
  expect(selectedReferenceChanges([one,two],[two,one])).toBeNull()
  expect(selectedReferenceChanges([],[])).toBeNull()
  const a=selectedReferenceChanges([one],[two])!
  expect(a.removed).toEqual([one]);expect(a.added).toEqual([two]);expect(a.changeHash).toMatch(/^[a-f0-9]{64}$/)
  expect(selectedReferenceChanges([two,one],[])?.changeHash).toBe(selectedReferenceChanges([one,two],[])?.changeHash)
 })
 it('fails closed on duplicated slots, malformed provided pointers and undeclared body fields',()=>{
  expect(()=>selectedReferenceChanges([one,one],[])).toThrow('DUPLICATE_SELECTED_REFERENCE_SLOT')
  expect(()=>selectedReferenceChanges([{...one,selectedBinding:null} as any],[])).toThrow()
  expect(()=>selectedReferenceChanges([{...one,reportBody:'must not copy'} as any],[])).toThrow()
 })
 it('rejects exact scale selection on every other unit type before any author mutation',()=>{
  for(const type of ['COGNITIVE','FORM','SITUATIONAL'])expect(addCompositeItemSchema.safeParse({type,scaleId:id(5),
   standardCombination:{releaseId:id(2),combinationHash:one.sourceHash},cognitiveAssignmentId:id(6),formType:'text_input',formLabel:'Synthetic',
   situationalInstrumentKey:'synthetic',situationalInstrumentVersion:'1.0.0'}).success).toBe(false)
 })
})
