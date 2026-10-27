import {describe,it,expect} from 'vitest'
import {pickerSourceUnavailable} from '../../modules/education-tools/assessment-resource.service'
import {CompositeServiceError} from '../../modules/composite/composite.errors'
import {EducationAssessmentSourceError} from '../../modules/education-tools/assessment-resource.repository'
describe('source picker typed unavailable failures',()=>{
 it('projects known invalid source definitions but not unknown HTTP-shaped or SQL errors',()=>{
  expect(pickerSourceUnavailable(new CompositeServiceError('Synthetic invalid source',400))).toBe(true)
  expect(pickerSourceUnavailable(Object.assign(new Error('unexpected adapter failure'),{statusCode:409}))).toBe(false)
  expect(pickerSourceUnavailable(Object.assign(new Error('SQL'),{code:'P2010',meta:{code:'42P01'}}))).toBe(false)
  expect(pickerSourceUnavailable(new EducationAssessmentSourceError('EDUCATION_ASSESSMENT_AUTHORITY_BUSY'))).toBe(false)
 })
})
