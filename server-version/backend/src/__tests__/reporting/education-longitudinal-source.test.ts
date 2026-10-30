import {randomUUID} from 'node:crypto'
import {privateScaleResourceEntry} from '../../modules/education-tools/private-tool.runtime-policy'
import type {PrivateScaleRuntimeOrigin} from '../../modules/education-tools/private-tool.runtime-origin'
import {describe,it,expect} from 'vitest'
import {compileResearchScale} from '../../modules/survey/builder.compiler'
import {validateScaleDefinition,scaleDefinitionSchema} from '../../modules/scale/scale-definition'
const definition=()=>compileResearchScale('Synthetic SELF',{schemaVersion:1,respondentType:'participant_self_report',aggregation:'mean',responseOptions:[{optionKey:'a',label:'A',score:1},{optionKey:'b',label:'B',score:2}],dimensions:[{dimensionKey:'total',label:'Total',direction:'descriptive'}],items:[{itemKey:'q',prompt:'Synthetic question',required:true,reverse:false,dimensionKeys:['total']}]})
describe('new fixed education SELF longitudinal disclosure',()=>{
 it('keeps absent old declarations absent and accepts an explicit numeric subset or empty set',()=>{
  const value=definition();value.report.audienceContract={schemaVersion:1,respondent:'STUDENT_SELF',audience:'student',locale:'zh-CN'}
  expect(scaleDefinitionSchema.parse(value).report.audienceContract).not.toHaveProperty('longitudinalMetricKeys')
  for(const longitudinalMetricKeys of [['total'],[]]){value.report.audienceContract.longitudinalMetricKeys=longitudinalMetricKeys;expect(validateScaleDefinition(value).issues.filter(i=>i.path.includes('longitudinal'))).toEqual([])}
 })
 it('rejects unknown, duplicate, observer and mismatched SELF numeric declarations',()=>{
  for(const [keys,respondentType,respondent,audience] of [[['missing'],'participant_self_report','STUDENT_SELF','student'],[['total','total'],'participant_self_report','STUDENT_SELF','student'],[['total'],'expert_report','ADULT_SELF','teacher'],[['total'],'participant_self_report','TEACHER_REPORT','student']] as const){
   const value=definition();value.respondentType=respondentType;value.report.audienceContract={schemaVersion:1,respondent,audience,locale:'zh-CN',longitudinalMetricKeys:[...keys]};expect(validateScaleDefinition(value).issues.some(i=>i.path.includes('longitudinal')&&i.severity==='error')).toBe(true)
  }
 })
})


it('preserves old private numeric rights without adding longitudinal disclosure and freezes only explicit SELF keys',()=>{
 const value=definition();value.report.audienceContract={schemaVersion:1,respondent:'STUDENT_SELF',audience:'student',locale:'zh-CN'}
 const origin:PrivateScaleRuntimeOrigin={schemaVersion:1,adapterVersion:'1.0.0',kind:'AUTHOR_PRIVATE',entry:'SCHOOL',organizationId:randomUUID(),ownerUserId:randomUUID(),toolId:randomUUID(),versionId:randomUUID(),contentHash:'a'.repeat(64),definitionHash:'b'.repeat(64),releaseId:randomUUID(),releaseHash:'c'.repeat(64),variantKey:'STUDENT:SELF'}
 const rule=()=>privateScaleResourceEntry(origin,'Synthetic SELF',value,randomUUID()).resultDisclosure!.audiences
 expect(rule().RESPONDENT).toEqual({mode:'INDIVIDUAL_SUMMARY',metricKeys:['total'],longitudinalMetricKeys:[]})
 value.report.audienceContract.longitudinalMetricKeys=['total'];expect(rule().RESPONDENT.longitudinalMetricKeys).toEqual(['total']);expect(rule().SUBJECT.mode).toBe('NONE')
 value.report.audienceContract.longitudinalMetricKeys=[];expect(rule().RESPONDENT.longitudinalMetricKeys).toEqual([])
 delete value.report.audienceContract;expect(rule().RESPONDENT).toEqual({mode:'NONE',metricKeys:[],longitudinalMetricKeys:[]})
})
