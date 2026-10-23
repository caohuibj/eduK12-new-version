import {describe,it,expect} from 'vitest'
import {compileEducationApplicability,educationApplicabilitySchema,readFrozenEducationApplicability} from '../../modules/scale-library-governance/education-applicability'
import {submissionInput} from '../../modules/scale-library-governance/contracts'
const selfPairs={schemaVersion:1,administrations:[{population:'STUDENT',responseMode:'SELF'},{population:'TEACHER',responseMode:'SELF'}]}

describe('exact library version education applicability',()=>{
 it('compiles explicit self pairs without inventing cross-population ratings',()=>{
  const result=compileEducationApplicability(selfPairs)
  expect(result.variants).toEqual([
   {variantKey:'STUDENT:SELF',population:'STUDENT',responseMode:'SELF',subjectRole:'STUDENT',respondentRole:'STUDENT',relationshipKinds:['SELF'],perspective:'SELF_REPORT'},
   {variantKey:'TEACHER:SELF',population:'TEACHER',responseMode:'SELF',subjectRole:'TEACHER',respondentRole:'TEACHER',relationshipKinds:['SELF'],perspective:'SELF_REPORT'},
  ])
  expect(result.status).toBe('DECLARED_CONTENT_ONLY')
  expect(result.canPublish).toBe(false)
  expect(result).not.toHaveProperty('resultDisclosure')
 })
 it('preserves the declared direction of parent, teacher and student observations',()=>{
  const {variants}=compileEducationApplicability({schemaVersion:1,administrations:[
   {population:'STUDENT',responseMode:'PARENT_REPORT'},{population:'STUDENT',responseMode:'TEACHER_REPORT'},
   {population:'TEACHER',responseMode:'STUDENT_REPORT'},
  ]})
  expect(variants.map(v=>[v.subjectRole,v.respondentRole,v.perspective])).toEqual([
   ['STUDENT','PARENT','OBSERVER_REPORT'],['STUDENT','TEACHER','OBSERVER_REPORT'],['TEACHER','STUDENT','OBSERVER_REPORT'],
  ])
  expect(variants[0].relationshipKinds).toEqual(['PARENT_CHILD'])
  expect(variants[1].relationshipKinds).toEqual(['CLASS_TEACHER_STUDENT','COURSE_TEACHER_STUDENT'])
 })
 it('requires a supported unambiguous pair and rejects duplicate or empty choices',()=>{
  for(const administrations of [[],[{population:'TEACHER',responseMode:'PARENT_REPORT'}],
   [{population:'STUDENT',responseMode:'STUDENT_REPORT'}],[selfPairs.administrations[0],selfPairs.administrations[0]],
   [{population:'ADULT',responseMode:'SELF'}],
  ])expect(educationApplicabilitySchema.safeParse({schemaVersion:1,administrations}).success).toBe(false)
 })
 it('does not infer old applicability from a source product, prose or respondent type',()=>{
  for(const value of [undefined,null,{respondentType:'student_self_report'},{product:'SCHOOL'},
   {schemaVersion:1,applicability:'students'}, {...selfPairs,product:'SCHOOL'},
  ])expect(educationApplicabilitySchema.safeParse(value).success).toBe(false)
 })
 it('binds a versioned contract hash independent of selection order, but not content changes',()=>{
  const a=compileEducationApplicability(selfPairs)
  const reversed=compileEducationApplicability({...selfPairs,administrations:[...selfPairs.administrations].reverse()})
  expect(reversed.contractHash).toBe(a.contractHash)
  expect(compileEducationApplicability({...selfPairs,administrations:[selfPairs.administrations[0]]}).contractHash).not.toBe(a.contractHash)
  expect(a.compilerVersion).toBe('EDUCATION_APPLICABILITY_V1')
 })
 it('keeps old Training and Survey application inputs valid without creating defaults',()=>{
  const id='00000000-0000-4000-8000-000000000001'
  const original={requestId:id,releaseId:id,metadata:{title:'Synthetic',author:'Synthetic',copyright:'Self authored',applicability:'Not a machine declaration',scoringDescription:'Mean',reportDescription:'Description'}}
  expect(submissionInput.parse(original)).not.toHaveProperty('educationApplicability')
  expect(submissionInput.parse({...original,educationApplicability:selfPairs}).educationApplicability).toEqual(selfPairs)
 })
 it('requires the persisted compiler and hash, preserving absent legacy declarations',()=>{
  expect(readFrozenEducationApplicability({})).toBeNull()
  const compiled=compileEducationApplicability(selfPairs)
  const frozen={educationApplicability:compiled.declaration,educationApplicabilityHash:compiled.contractHash,educationApplicabilityCompilerVersion:compiled.compilerVersion}
  expect(readFrozenEducationApplicability(frozen)).toEqual(compiled)
  expect(()=>readFrozenEducationApplicability({...frozen,educationApplicabilityHash:'0'.repeat(64)})).toThrow('FROZEN_CONTRACT_MISMATCH')
  expect(()=>readFrozenEducationApplicability({educationApplicability:compiled.declaration})).toThrow('FROZEN_CONTRACT_MISMATCH')
 })

})
