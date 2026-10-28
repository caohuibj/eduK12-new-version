import {describe,expect,it} from 'vitest'
import {freezeCompositeActiveSlotSet,frozenEducationBlockInstruction} from '../../modules/assessment-runtime/attempt-runtime'
describe('ordinary questionnaire frozen block presentation',()=>{
 it('stores a multi-page Form instruction once, resolves it on every own page and never borrows another block',()=>{
  const set=freezeCompositeActiveSlotSet({attemptEpoch:1,
   scales:[{compositeItemId:'scale',code:'private',instrumentVersion:'1',sourceDefinitionHash:'a'.repeat(64)}],cognitive:[],
   formSections:[{sectionId:'p1',definitionHash:'b'.repeat(64)},{sectionId:'p2',definitionHash:'c'.repeat(64)}],
   unitOrder:new Map([['scale:scale',0],['form-section:p1',1],['form-section:p2',2]]),
   unitPresentation:new Map([['scale:scale',{blockId:'scale-block'}],['form-section:p1',{blockId:'form-block',instruction:'Same block\nnext page'}],['form-section:p2',{blockId:'form-block'}]])})
  expect(set.slots).toHaveLength(3)
  expect(set.slots.filter(slot=>slot.sourceBinding.educationInstruction)).toHaveLength(1)
  expect(frozenEducationBlockInstruction(set.slots,'form-section:p1')).toBe('Same block\nnext page')
  expect(frozenEducationBlockInstruction(set.slots,'form-section:p2')).toBe('Same block\nnext page')
  expect(frozenEducationBlockInstruction(set.slots,'scale:scale')).toBeUndefined()
  expect(frozenEducationBlockInstruction(set.slots,'not-a-slot')).toBeUndefined()
 })
})
