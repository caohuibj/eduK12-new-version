import {describe,it,expect} from 'vitest'
import {pickerSourceUnavailable} from '../../modules/education-tools/assessment-resource.service'
import {CompositeServiceError} from '../../modules/composite/composite.errors'
import {EducationAssessmentSourceError} from '../../modules/education-tools/assessment-resource.repository'
import {InstrumentFinalSubmitError} from '../../services/instrumentFinalSubmit'
import {typedCompositeFormQuestion} from '../../modules/assessment-runtime/typed-form'
describe('source picker typed unavailable failures',()=>{
 it('projects known invalid source definitions but not unknown HTTP-shaped or SQL errors',()=>{
  expect(pickerSourceUnavailable(new CompositeServiceError('Synthetic invalid source',400))).toBe(true)
  expect(pickerSourceUnavailable(Object.assign(new Error('unexpected adapter failure'),{statusCode:409}))).toBe(false)
  expect(pickerSourceUnavailable(Object.assign(new Error('SQL'),{code:'P2010',meta:{code:'42P01'}}))).toBe(false)
  expect(pickerSourceUnavailable(new EducationAssessmentSourceError('EDUCATION_ASSESSMENT_AUTHORITY_BUSY'))).toBe(false)
 })
 it('recognizes the actual typed Form definition failure without swallowing other final-submit errors',()=>{
  let thrown:unknown
  try{typedCompositeFormQuestion({id:'synthetic',formType:'text_input',formLabel:'Different persisted title',placeholder:null,required:true,formOptions:null,contextKey:null,position:0,formSectionPosition:0,
   formDefinition:{itemKey:'synthetic_source',type:'SHORT_TEXT',prompt:'Original frozen title',required:true}})}catch(error){thrown=error}
  expect(thrown).toBeInstanceOf(InstrumentFinalSubmitError)
  expect(thrown).toMatchObject({code:'FORM_ANSWER_INVALID',statusCode:400})
  expect(pickerSourceUnavailable(thrown)).toBe(true)
  expect(pickerSourceUnavailable(new InstrumentFinalSubmitError('STALE_ATTEMPT','Unexpected runtime failure',500))).toBe(false)
  expect(pickerSourceUnavailable(new InstrumentFinalSubmitError('FORM_ANSWER_INVALID','Unexpected internal failure',500))).toBe(false)
 })
})
