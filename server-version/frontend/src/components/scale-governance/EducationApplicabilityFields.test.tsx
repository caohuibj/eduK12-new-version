import {act,cleanup,render,renderHook,screen} from '@testing-library/react'
import {afterEach,describe,expect,it} from 'vitest'
import {EducationApplicabilitySummary,useEducationApplicabilityDraft} from './EducationApplicabilityFields'
afterEach(cleanup)
describe('education applicability draft contract',()=>{
 it('accepts exactly the five supported pairs, canonicalizes order, and rejects duplicates or invalid pairs',()=>{
  const {result}=renderHook(()=>useEducationApplicabilityDraft('r1'))
  expect(result.current.value).toBeUndefined();expect(result.current.valid).toBe(true)
  const pairs=[{population:'TEACHER' as const,responseMode:'STUDENT_REPORT' as const},{population:'STUDENT' as const,responseMode:'TEACHER_REPORT' as const},{population:'STUDENT' as const,responseMode:'SELF' as const},{population:'TEACHER' as const,responseMode:'SELF' as const},{population:'STUDENT' as const,responseMode:'PARENT_REPORT' as const}]
  act(()=>result.current.setRows(pairs))
  expect(result.current.valid).toBe(true)
  expect(result.current.value?.administrations).toHaveLength(5)
  expect(result.current.value?.administrations[0]).toEqual({population:'STUDENT',responseMode:'PARENT_REPORT'})
  act(()=>result.current.setRows([...pairs,pairs[0]]))
  expect(result.current.valid).toBe(false);expect(result.current.value).toBeUndefined()
  act(()=>result.current.setRows([{population:'TEACHER',responseMode:'PARENT_REPORT'}]))
  expect(result.current.valid).toBe(false);expect(result.current.value).toBeUndefined()
  act(()=>result.current.setRows([{population:'STUDENT',responseMode:''}]))
  expect(result.current.valid).toBe(false)
 })
 it.each([undefined,null])('renders legacy absence as undeclared rather than guessing self-report (%s)',value=>{
  render(<EducationApplicabilitySummary value={value}/>)
  expect(screen.getByText('未声明学校/教师适用方式。原 Training / Survey 使用规则不变。')).toBeInTheDocument()
  expect(screen.queryByRole('list')).not.toBeInTheDocument()
  expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
 })
})
