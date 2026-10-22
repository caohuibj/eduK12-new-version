import {describe,it,expect} from 'vitest'
import {randomUUID} from 'node:crypto'
import {compileResearchScale} from '../../modules/survey/builder.compiler'
import {canonicalHash} from '../../modules/assessment-runtime/canonical'
import {compileEducationApplicability} from '../../modules/scale-library-governance/education-applicability'
import {educationLibraryResourceEntry,educationLibraryResourceProduct,type EducationLibraryOrigin} from '../../modules/scale-library-governance/education-runtime-entry'
const draft={schemaVersion:1,presentationMode:'ALL_AT_ONCE',respondentType:'participant_self_report',aggregation:'mean',responseOptions:[{optionKey:'one',label:'1',score:1},{optionKey:'two',label:'2',score:2}],dimensions:[{dimensionKey:'total',label:'总分',direction:'descriptive'}],items:[{itemKey:'item',prompt:'问题',required:true,reverse:false,dimensionKeys:['total']}]}
function fixture(population='STUDENT',responseMode='SELF'){
 const definition=compileResearchScale('Synthetic',draft),compiled=compileEducationApplicability({schemaVersion:1,administrations:[{population,responseMode}]})
 const origin:EducationLibraryOrigin={schemaVersion:1,adapterVersion:'1.0.0',entryId:randomUUID(),product:'SCHOOL',releaseId:randomUUID(),
  contentHash:'a'.repeat(64),approvedSnapshotHash:'b'.repeat(64),sourceDefinitionHash:canonicalHash(definition),applicabilityHash:compiled.contractHash,
  variantKey:compiled.variants[0].variantKey as EducationLibraryOrigin['variantKey'],dependencies:[]}
 return {origin,variant:compiled.variants[0],definition,title:'Synthetic',compositeId:randomUUID()}
}
describe('Education library resource entry compiler',()=>{
 it('uses exact semver and binds complete source, not only scoring hash',()=>{
  const input=fixture(),entry=educationLibraryResourceEntry(input)
  expect(entry.applicability.resourceVersion).toBe('1.0.0')
  expect(educationLibraryResourceProduct(entry.applicability.resourceKey)).toBe('SCHOOL')
  expect(entry.libraryOrigin.sourceDefinitionHash).toBe(canonicalHash(input.definition))
  expect(entry.scienceMaturity).toBe('PILOT')
  expect(()=>educationLibraryResourceEntry({...input,origin:{...input.origin,sourceDefinitionHash:'0'.repeat(64)}})).toThrow('ORIGIN_MISMATCH')
  const changed=structuredClone(input.definition);changed.report.reportVersion='another-report-version'
  expect(()=>educationLibraryResourceEntry({...input,definition:changed})).toThrow('ORIGIN_MISMATCH')
 })
 it('does not infer reports from applicability or grant organization individual access',()=>{
  const input=fixture();delete input.definition.report.audienceContract
  input.origin.sourceDefinitionHash=canonicalHash(input.definition)
  const entry=educationLibraryResourceEntry(input)
  expect(entry.resultDisclosure?.audiences.RESPONDENT.mode).toBe('NONE')
  expect(entry.resultDisclosure?.audiences.ORGANIZATION.mode).toBe('NONE')
 })
 it('allows only matching explicit self content audience as the individual ceiling',()=>{
  const input=fixture('TEACHER')
  input.definition.report.audienceContract={...input.definition.report.audienceContract,audience:'teacher'} as any
  input.origin.sourceDefinitionHash=canonicalHash(input.definition)
  const entry=educationLibraryResourceEntry(input)
  expect(entry.resultDisclosure?.audiences.RESPONDENT.mode).toBe('INDIVIDUAL_SUMMARY')
  for(const audience of ['SUBJECT','TEACHER','PARENT','PROFESSIONAL','ORGANIZATION','RESEARCH'] as const)
   expect(entry.resultDisclosure?.audiences[audience].mode).toBe('NONE')
 })
 it('does not disclose a subject result to an observer or permit a forged pair',()=>{
  const input=fixture('TEACHER','STUDENT_REPORT')
  input.definition.report.audienceContract={...input.definition.report.audienceContract,audience:'student'} as any
  input.origin.sourceDefinitionHash=canonicalHash(input.definition)
  const entry=educationLibraryResourceEntry(input)
  expect(entry.resultDisclosure?.audiences.RESPONDENT.mode).toBe('NONE')
  expect(entry.applicability.respondentRoles).toEqual(['STUDENT'])
  expect(()=>educationLibraryResourceEntry({...input,variant:{...input.variant,respondentRole:'TEACHER'}})).toThrow('ORIGIN_MISMATCH')
 })
 for(const mode of ['PARENT_REPORT','TEACHER_REPORT'])it(`uses existing private observer consent for ${mode} without granting any report audience`,()=>{
  const input=fixture('STUDENT',mode)
  const entry=educationLibraryResourceEntry(input)
  expect(entry.applicability.visibilityPolicyKey).toBe('observer_private_respondent_v1')
  expect(entry.resultDisclosure?.policyKey).toBe('EDUCATION_LIBRARY_APPROVED_CONTENT_V1')
  expect(Object.values(entry.resultDisclosure!.audiences).every(rule=>rule.mode==='NONE')).toBe(true)
 })
 it('does not add observer consent to either self-report population',()=>{
  for(const population of ['STUDENT','TEACHER']){
   const entry=educationLibraryResourceEntry(fixture(population,'SELF'))
   expect(entry.applicability.visibilityPolicyKey).toBe('EDUCATION_LIBRARY_APPROVED_CONTENT_V1')
  }
 })
 it('refuses unsupported dependency consumption rather than emptying choices',()=>{
  const input=fixture();input.origin.dependencies=[{releaseId:randomUUID(),contentHash:'c'.repeat(64)}]
  expect(()=>educationLibraryResourceEntry(input)).toThrow('DEPENDENCY_ADAPTER_NOT_READY')
 })
 it('exposes explicit class-only teacher observer targeting without changing disclosure or approved relationships',()=>{
  const input=fixture('STUDENT','TEACHER_REPORT')
  const entry=educationLibraryResourceEntry(input)
  expect(entry.allowedTargetModes).toEqual(['HOMEROOM_TEACHER','ALL_CLASS_TEACHERS','SELECTED_CLASS_TEACHERS'])
  expect(entry.allowedTargetModes).not.toContain('COURSE_TEACHER')
  expect(entry.applicability.relationshipKinds).toEqual(input.variant.relationshipKinds)
  expect(entry.applicability.visibilityPolicyKey).toBe('observer_private_respondent_v1')
  expect(Object.values(entry.resultDisclosure!.audiences).every(rule=>rule.mode==='NONE')).toBe(true)
 })
 it('does not add teacher targeting to self or parent reports',()=>{
  for(const [population,mode] of [['STUDENT','SELF'],['TEACHER','SELF'],['STUDENT','PARENT_REPORT']])
   expect(educationLibraryResourceEntry(fixture(population,mode)).allowedTargetModes).toBeUndefined()
 })

})
