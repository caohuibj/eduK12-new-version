import {describe,it,expect} from 'vitest'
import {assertTeacherPersonalAssessmentPolicy} from '../../modules/huiteacher/assessmentRunPolicy'
import type {RunResourcePolicy,RunTrackNarrowingRequest} from '../../modules/assessment-run/resourceAuthority'
const requested:RunTrackNarrowingRequest={subjectRoles:['TEACHER'],respondentRoles:['TEACHER'],relationshipKinds:['SELF'],
  perspectives:['SELF_REPORT'],analysisMode:'INDIVIDUAL_ONLY',visibilityPolicyKey:'synthetic-private',minimumRespondents:null}
const policy:RunResourcePolicy={...requested,family:'BUNDLE',key:'synthetic-only',version:'1.0.0',scientificMaturity:'PILOT',
  applicabilityHash:'a'.repeat(64),runtimeLaunchTarget:{kind:'COMPOSITE',ref:'synthetic-runtime'}}
describe('Teacher new-family personal task ceiling',()=>{
 it.each(['BUNDLE','COGNITIVE','SITUATIONAL'] as const)('accepts an exact %s self policy without granting report rights',family=>{
   const source={...policy,family};expect(()=>assertTeacherPersonalAssessmentPolicy(source,requested)).not.toThrow()
   expect(source.resultDisclosure).toBeUndefined()
 })
 it.each([
   {subjectRoles:['STUDENT']},{respondentRoles:['STUDENT']},{subjectRoles:['TEACHER','STUDENT']},
   {relationshipKinds:['COURSE_TEACHER_STUDENT']},{perspectives:['OBSERVER_REPORT']},
   {analysisMode:'COHORT_AGGREGATE',minimumRespondents:5},{minimumRespondents:1},
   {visibilityPolicyKey:'weaker'},
 ] as Partial<RunTrackNarrowingRequest>[])('refuses cross-population or disclosure widening %j',patch=>{
   expect(()=>assertTeacherPersonalAssessmentPolicy(policy,{...requested,...patch})).toThrow()
 })
 it('refuses missing runtime, unsupported family and mismatched subject ceiling',()=>{
   expect(()=>assertTeacherPersonalAssessmentPolicy({...policy,runtimeLaunchTarget:null},requested)).toThrow()
   expect(()=>assertTeacherPersonalAssessmentPolicy({...policy,family:'FORM'},requested)).toThrow()
   expect(()=>assertTeacherPersonalAssessmentPolicy({...policy,subjectRoles:['STUDENT']},requested)).toThrow()
 })
})
