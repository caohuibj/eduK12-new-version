import {act,fireEvent,render,screen,waitFor} from '@testing-library/react'
import {describe,it,expect,vi} from 'vitest'
import {createEducationAssessmentFeedback} from './educationAssessmentFeedbackAdapter'
import type {EducationReportApi} from './EducationScalePersonalReport'
describe('shared education application feedback adapter',()=>{
 it.each(['SCHOOL','TEACHER'] as const)('uses the existing %s transport and only an execution-scoped report path',async entry=>{
  const api=vi.fn().mockResolvedValue({schemaVersion:1,kind:'EDUCATION_ASSESSMENT_PERSONAL_REPORT',state:'COMPLETED'})
  const renderer=createEducationAssessmentFeedback({api:api as EducationReportApi,entry})
  render(<>{renderer({executionId:'own-execution',attemptId:'not-report-authority'})}</>)
  await waitFor(()=>expect(screen.getByRole('button',{name:'重新读取反馈'})).toBeEnabled())
  expect(api).toHaveBeenCalledExactlyOnceWith('/assessment-reports/executions/own-execution')
  expect(api.mock.calls.some(call=>JSON.stringify(call).includes('not-report-authority'))).toBe(false)
 })
 it('closes a late pending response and can explicitly reopen through fresh authorization',async()=>{
  let resolve!:(data:unknown)=>void
  const pending=new Promise(resolveValue=>{resolve=resolveValue}),api=vi.fn().mockReturnValueOnce(pending).mockResolvedValueOnce({state:'WITHHELD'})
  const renderer=createEducationAssessmentFeedback({api:api as EducationReportApi,entry:'TEACHER'})
  render(<>{renderer({executionId:'own-execution',attemptId:'parent'})}</>)
  fireEvent.click(screen.getByRole('button',{name:'关闭本人反馈'}))
  await act(async()=>{resolve({state:'READY',message:'迟到的旧反馈'});await pending})
  expect(screen.queryByText('迟到的旧反馈')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button',{name:'重新查看获准反馈'}))
  expect(await screen.findByText('当前反馈尚未获准显示，或暂未达到开放时间与披露条件。')).toBeInTheDocument()
  expect(api).toHaveBeenCalledTimes(2)
 })
})
