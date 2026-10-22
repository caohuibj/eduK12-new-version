import {describe,expect,it} from 'vitest'
import {compileEducationApplicability} from '../../modules/scale-library-governance/education-applicability'
import {runnableEducationLibraryVariants} from '../../modules/scale-library-governance/education-runtime-resources'
import {canonicalHash} from '../../modules/assessment-runtime/canonical'

const all=()=>compileEducationApplicability({schemaVersion:1,administrations:[
 {population:'STUDENT',responseMode:'SELF'},{population:'STUDENT',responseMode:'PARENT_REPORT'},
 {population:'STUDENT',responseMode:'TEACHER_REPORT'},{population:'TEACHER',responseMode:'SELF'},
 {population:'TEACHER',responseMode:'STUDENT_REPORT'},
]})
describe('exact product runtime allocation without modifying approved applicability',()=>{
 it('Teacher allocates its one runnable pair, preserving the complete five-pair approved contract',()=>{
  const approved=all(),before=canonicalHash(approved)
  const runnable=runnableEducationLibraryVariants('TEACHER',approved.variants)
  expect(runnable.map(v=>v.variantKey)).toEqual(['TEACHER:SELF'])
  expect(runnable[0]).toBe(approved.variants.find(v=>v.variantKey==='TEACHER:SELF'))
  expect(approved.declaration.administrations).toHaveLength(5)
  expect(approved.variants).toHaveLength(5);expect(canonicalHash(approved)).toBe(before)
 })
 it('School preserves all three legal variants without creating Teacher-only resources',()=>{
  const approved=all(),before=canonicalHash(approved)
  const runnable=runnableEducationLibraryVariants('SCHOOL',approved.variants)
  expect(runnable.map(v=>v.variantKey)).toEqual(['STUDENT:PARENT_REPORT','STUDENT:SELF','STUDENT:TEACHER_REPORT'])
  expect(runnable.every(v=>approved.variants.includes(v))).toBe(true)
  expect(canonicalHash(approved)).toBe(before)
 })
 it('rejects a declaration with no runnable pair instead of returning a successful empty allocation',()=>{
  const student=compileEducationApplicability({schemaVersion:1,administrations:[{population:'STUDENT',responseMode:'SELF'}]})
  const teacher=compileEducationApplicability({schemaVersion:1,administrations:[{population:'TEACHER',responseMode:'SELF'}]})
  const future=compileEducationApplicability({schemaVersion:1,administrations:[{population:'TEACHER',responseMode:'STUDENT_REPORT'}]})
  expect(()=>runnableEducationLibraryVariants('TEACHER',student.variants)).toThrow('EDUCATION_LIBRARY_VARIANT_UNSUPPORTED')
  expect(()=>runnableEducationLibraryVariants('SCHOOL',teacher.variants)).toThrow('EDUCATION_LIBRARY_VARIANT_UNSUPPORTED')
  for(const product of ['SCHOOL','TEACHER'] as const)
   expect(()=>runnableEducationLibraryVariants(product,future.variants)).toThrow('EDUCATION_LIBRARY_VARIANT_UNSUPPORTED')
 })
})
