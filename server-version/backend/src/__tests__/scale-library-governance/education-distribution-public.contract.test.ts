import {randomUUID} from 'node:crypto'
import {describe,expect,it} from 'vitest'
import {educationRecipientInput,educationPublicGrantInput} from '../../modules/scale-library-governance/education-distribution-public-contracts'
import {educationDistributionReadiness,assertEducationPublicDistributionReady} from '../../modules/scale-library-governance/education-distribution-readiness'
import {isSupportedEducationLibraryVariant} from '../../modules/scale-library-governance/education-supported-variants'
import {compileEducationApplicability} from '../../modules/scale-library-governance/education-applicability'
import {compileResearchScale} from '../../modules/survey/builder.compiler'
import type {LibrarySnapshot} from '../../modules/scale-library-governance/source'
const exact={releaseId:randomUUID(),contentHash:'a'.repeat(64),product:'SCHOOL' as const}
const definition={schemaVersion:1,presentationMode:'ALL_AT_ONCE',respondentType:'participant_self_report',aggregation:'mean',responseOptions:[{optionKey:'one',label:'1',score:1},{optionKey:'two',label:'2',score:2}],dimensions:[{dimensionKey:'total',label:'总分',direction:'descriptive'}],items:[{itemKey:'item',prompt:'问题',required:true,reverse:false,dimensionKeys:['total']}]}
const declaration={schemaVersion:1 as const,administrations:[{population:'STUDENT' as const,responseMode:'SELF' as const}]}
const compiled=compileEducationApplicability(declaration)
const snapshot:LibrarySnapshot={title:'Synthetic',product:'SURVEY',instrumentClass:'CUSTOM_DESCRIPTIVE',definition,
 compiledDefinition:compileResearchScale('Synthetic',definition),educationApplicability:declaration,
 educationApplicabilityHash:compiled.contractHash,educationApplicabilityCompilerVersion:compiled.compilerVersion}
describe('Education distribution contract, not a public enablement',()=>{
 it('requires exact release/hash and explicit org vs user scope without legacy field smuggling',()=>{
  const org={...exact,scopeKind:'ORGANIZATION' as const}
  expect(educationRecipientInput.parse(org).keyword).toBe('')
  expect(educationRecipientInput.safeParse({...org,organizationId:randomUUID()}).success).toBe(false)
  expect(educationRecipientInput.safeParse({...org,scopeKind:'USER'}).success).toBe(false)
  expect(educationRecipientInput.safeParse({...org,page:1}).success).toBe(false)
  expect(educationRecipientInput.safeParse({...org,contentHash:'latest'}).success).toBe(false)
  const command={...org,requestId:randomUUID(),organizationId:randomUUID(),userId:null}
  expect(educationPublicGrantInput.safeParse(command).success).toBe(true)
  expect(educationPublicGrantInput.safeParse({...command,userId:randomUUID()}).success).toBe(false)
  expect(educationPublicGrantInput.safeParse({...command,userId:undefined}).success).toBe(false)
 })
 it('separates content compatibility and final public readiness, with specific temporary reasons',()=>{
  expect(educationDistributionReadiness(snapshot,{approved:true,dependencyReleaseIds:[]})).toMatchObject({
   contentCompatible:true,status:'NOT_READY',canDistribute:false,reason:'EDUCATION_LIBRARY_ADAPTER_NOT_READY'})
  expect(()=>assertEducationPublicDistributionReady()).toThrow('ADAPTER_NOT_READY')
  expect(educationDistributionReadiness(snapshot).reason).toBe('EDUCATION_LIBRARY_APPROVAL_REQUIRED')
  expect(educationDistributionReadiness(snapshot,{approved:true,dependencyReleaseIds:[randomUUID()]}).reason).toBe('EDUCATION_LIBRARY_DEPENDENCY_ADAPTER_NOT_READY')
  const {educationApplicability:_a,educationApplicabilityHash:_h,educationApplicabilityCompilerVersion:_v,...missing}=snapshot
  expect(educationDistributionReadiness(missing).reason).toBe('EDUCATION_LIBRARY_APPLICABILITY_REQUIRED')
  expect(educationDistributionReadiness({...snapshot,educationApplicabilityHash:'bad'}).reason).toBe('EDUCATION_APPLICABILITY_FROZEN_CONTRACT_MISMATCH')
 })
 const readyFor=(administrations:Parameters<typeof compileEducationApplicability>[0])=>{
  const compiled=compileEducationApplicability({schemaVersion:1,administrations})
  return educationDistributionReadiness({...snapshot,educationApplicability:compiled.declaration,
   educationApplicabilityHash:compiled.contractHash,educationApplicabilityCompilerVersion:compiled.compilerVersion},
   {approved:true,dependencyReleaseIds:[]})
 }
 it('keeps all three student modes School-only while the public gate stays closed',()=>{
  for(const responseMode of ['SELF','PARENT_REPORT','TEACHER_REPORT']){
   const readiness=readyFor([{population:'STUDENT',responseMode}])
   expect(readiness.products.SCHOOL.contentCompatible).toBe(true)
   expect(readiness.products.TEACHER).toMatchObject({contentCompatible:false,canDistribute:false,reason:'EDUCATION_LIBRARY_PRODUCT_VARIANT_ADAPTER_NOT_READY'})
   expect(readiness.products.SCHOOL.canDistribute).toBe(false)
   expect(isSupportedEducationLibraryVariant('SCHOOL','STUDENT:'+responseMode)).toBe(true)
  }
 })
 it('makes teacher self-report Teacher-only, not an automatic School grant',()=>{
  const readiness=readyFor([{population:'TEACHER',responseMode:'SELF'}])
  expect(readiness.products.TEACHER.contentCompatible).toBe(true)
  expect(readiness.products.SCHOOL.contentCompatible).toBe(false)
  expect(readiness.products.TEACHER.canDistribute).toBe(false)
 })
 it('projects mixed declarations independently and keeps an unsupported teacher/student-rating declaration intact',()=>{
  const mixed=readyFor([{population:'STUDENT',responseMode:'PARENT_REPORT'},{population:'TEACHER',responseMode:'SELF'},
   {population:'TEACHER',responseMode:'STUDENT_REPORT'}])
  expect(mixed.products.SCHOOL.contentCompatible).toBe(true)
  expect(mixed.products.TEACHER.contentCompatible).toBe(true)
  const unsupported=readyFor([{population:'TEACHER',responseMode:'STUDENT_REPORT'}])
  for(const product of ['SCHOOL','TEACHER'] as const){
   expect(unsupported.products[product]).toMatchObject({contentCompatible:false,status:'NOT_READY',canDistribute:false,
    reason:'EDUCATION_LIBRARY_PRODUCT_VARIANT_ADAPTER_NOT_READY'})
   expect(isSupportedEducationLibraryVariant(product,'TEACHER:STUDENT_REPORT')).toBe(false)
  }
 })

})
