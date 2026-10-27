import {describe,it,expect} from 'vitest'
import {registerEducationAssessmentSchema} from '../../modules/education-tools/assessment-resource.service'
const id='50000000-0000-4000-8000-000000000001'
const input={expectedPreparationHash:'a'.repeat(64),disclosure:{},references:{schemaVersion:1,units:[]},reports:[],licenses:[{resourceId:id,grantId:id}]}
describe('education registration requires an explicit shared feedback timing policy',()=>{
 it('refuses absence, null, unknown mode and invalid or timezone-free scheduled times',()=>{
  for(const feedbackPolicy of [undefined,null,{schemaVersion:1,mode:'OTHER'},
   {schemaVersion:1,mode:'SCHEDULED',releaseAt:'2026-02-30T12:00:00Z'},
   {schemaVersion:1,mode:'SCHEDULED',releaseAt:'2026-10-29T12:00:00'}])
   expect(registerEducationAssessmentSchema.safeParse({...input,feedbackPolicy}).success).toBe(false)
 })
 it('normalizes explicit offset timestamps to the existing Training UTC representation',()=>{
  const parsed=registerEducationAssessmentSchema.parse({...input,feedbackPolicy:{schemaVersion:1,mode:'SCHEDULED',releaseAt:'2026-10-29T20:30:00+08:00'}})
  expect(parsed.feedbackPolicy).toEqual({schemaVersion:1,mode:'SCHEDULED',releaseAt:'2026-10-29T12:30:00.000Z'})
  expect(registerEducationAssessmentSchema.parse({...input,feedbackPolicy:{schemaVersion:1,mode:'IMMEDIATE'}}).feedbackPolicy).toEqual({schemaVersion:1,mode:'IMMEDIATE'})
 })
})
