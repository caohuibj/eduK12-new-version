import {describe,expect,it} from 'vitest'
import {educationParticipantReportPublishOption} from '../../modules/assessment-run/participant-report-option'
import type {RunResourcePolicy} from '../../modules/assessment-run/resourceAuthority'

const track=(modes:string[],entry='SCHOOL',variantKey='STUDENT:SELF')=>({resourcePolicy:{
 runtimeLaunchTarget:{kind:'COMPOSITE',ref:'fixed-parent'},
 educationComposition:{origin:{entry,variantKey},unitReports:modes.map(mode=>({respondent:{mode,metricKeys:[],longitudinalMetricKeys:[]}}))},
} as unknown as RunResourcePolicy})
describe('Education participant-report publication option',()=>{
 it('explains pure-Form compositions and all-withheld scored blocks before publication',()=>{
  for(const source of [track([]),track(['NONE','NONE'])]){
   const option=educationParticipantReportPublishOption([source])
   expect(option.eligible).toBe(false);expect(option.reason).toContain('仅用于数据采集')
  }
 })
 it('uses the same School and Teacher SELF policy and does not infer eligibility from metric choices',()=>{
  for(const source of [track(['INDIVIDUAL_SUMMARY']),track(['INDIVIDUAL_SUMMARY'],'TEACHER','TEACHER:SELF')])
   expect(educationParticipantReportPublishOption([source])).toEqual({eligible:true,reason:null})
 })
 it('allows mixed eligible/withheld tracks without broadening the withheld track',()=>{
  const hidden=track(['NONE'])
  expect(educationParticipantReportPublishOption([hidden,track(['INDIVIDUAL_SUMMARY'])]).eligible).toBe(true)
  expect(hidden.resourcePolicy.educationComposition!.unitReports[0].respondent.mode).toBe('NONE')
 })
 it('preserves direct Form and other non-composition publication behavior',()=>{
  expect(educationParticipantReportPublishOption([])).toEqual({eligible:true,reason:null})
  const direct={resourcePolicy:{runtimeLaunchTarget:{kind:'COMPOSITE',ref:'direct-form'}} as RunResourcePolicy}
  expect(educationParticipantReportPublishOption([direct])).toEqual({eligible:true,reason:null})
  expect(educationParticipantReportPublishOption([track(['NONE'],'SCHOOL','STUDENT:PARENT_REPORT')])).toEqual({eligible:true,reason:null})
 })
})
