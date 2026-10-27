import {describe,it,expect} from 'vitest'
import {canonicalHash} from '../../modules/assessment-runtime/canonical'
import {typedCompositeFormQuestion} from '../../modules/assessment-runtime/typed-form'
import {formQuestionSchema} from '../../modules/assessment-core/form/definition'
import {buildTrainingFlowUnits} from '../../modules/composite/training-flow-definition'

describe('shared typed Form identity consumed by education delivery',()=>{
 it('hashes a plain validated question without a temporary undefined condition',()=>{
  const item={id:'field',type:'FORM',formType:'SHORT_TEXT',formLabel:'Synthetic note',required:true,position:0,formSectionPosition:0,formSectionId:'section',
   formDefinition:formQuestionSchema.parse({itemKey:'note',type:'SHORT_TEXT',prompt:'Synthetic note',required:true,options:[],rows:[]})}
  const question=typedCompositeFormQuestion(item)
  expect(Object.hasOwn(question,'displayIf')).toBe(false)
  const units=buildTrainingFlowUnits({items:[item],formSections:[{id:'section',title:'Synthetic',position:0,items:[item]}]})
  expect(canonicalHash(units)).toMatch(/^[a-f0-9]{64}$/)
 })
 it('retains an explicit reviewed condition instead of stripping its policy',()=>{
  const condition={itemKey:'choice',operator:'EQUALS' as const,optionKey:'a'}
  const item={id:'conditional',formType:'SHORT_TEXT',formLabel:'Conditional note',required:true,position:1,
   formPolicy:{version:3,requiredRefusal:'BLOCK_SUBMIT',hiddenRequired:'EXEMPT'},
   formDefinition:formQuestionSchema.parse({itemKey:'note',type:'SHORT_TEXT',prompt:'Conditional note',required:true,options:[],rows:[],displayIf:condition})}
  expect(typedCompositeFormQuestion(item).displayIf).toEqual(condition)
 })
})
