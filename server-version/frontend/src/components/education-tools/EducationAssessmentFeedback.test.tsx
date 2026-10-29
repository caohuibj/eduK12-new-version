import {act,fireEvent,render,screen,waitFor} from '@testing-library/react'
import {describe,it,expect,vi} from 'vitest'
import {createEducationAssessmentFeedback} from './educationAssessmentFeedbackAdapter'
import type {EducationReportApi} from './EducationScalePersonalReport'
describe('shared education application feedback adapter',()=>{
 it.each(['SCHOOL','TEACHER'] as const)('%s uses ordinary execution feedback and renders each block without exposing an injected NONE same-key result',async entry=>{
  const unit={itemId:'visible',type:'SCALE',kind:'scale',scaleName:'允许块',scaleCode:'private',caveats:[],disclaimer:'仅描述性反馈',completedAt:null,totalTime:0,
   rawScoreFeedback:[{scoreKey:'total',rangeKey:'r',text:'允许块固定解释'}]}
  const api=vi.fn().mockResolvedValue({schemaVersion:1,kind:'EDUCATION_FEEDBACK',mode:'COMPOSITION',state:'READY',units:[
   {blockId:'a',kind:'SCALE',title:'允许块',state:'READY',nativeScaleUnits:[unit]},
   {blockId:'b',kind:'SCALE',title:'未开放块',state:'WITHHELD',nativeScaleUnits:[{...unit,itemId:'hidden',rawScoreFeedback:[{scoreKey:'total',rangeKey:'r',text:'不得显示的同名分数解释'}]}]},
   {blockId:'c',kind:'FORM',title:'无分数表单',state:'COMPLETION_ONLY'},
  ]})
  const renderer=createEducationAssessmentFeedback({api:api as EducationReportApi,entry})
  render(<>{renderer({executionId:'own-ordinary',attemptId:'not-authority',mode:'COMPOSITION'})}</>)
  expect(await screen.findByText('允许块固定解释')).toBeInTheDocument()
  expect(screen.getByText('本工具未开放个人反馈。')).toBeInTheDocument()
  expect(screen.getByText('表单已完成，不计算量表分数。')).toBeInTheDocument()
  expect(screen.queryByText('不得显示的同名分数解释')).not.toBeInTheDocument()
  expect(api).toHaveBeenCalledExactlyOnceWith('/run-executions/own-ordinary/feedback')
 })
 it('renders a declared block next to a native block without showing injected withheld declared content',async()=>{
  const declared={title:'Fixed report',blocks:[{type:'TEXT',text:'固定声明式解释'},{type:'METRIC',metricKey:'same',label:'独立指标',value:3,unit:'points',status:'INTERPRETABLE',display:'RAW'}],limitations:[],disclaimer:null}
  const api=vi.fn().mockResolvedValue({schemaVersion:1,kind:'EDUCATION_FEEDBACK',mode:'COMPOSITION',state:'READY',units:[
   {blockId:'one',kind:'SCALE',title:'声明式块',state:'READY',declaredReport:declared},
   {blockId:'none',kind:'SCALE',title:'隐藏声明式块',state:'WITHHELD',declaredReport:{...declared,blocks:[{type:'TEXT',text:'不得显示的声明式解释'}]}},
  ]})
  const renderer=createEducationAssessmentFeedback({api:api as EducationReportApi,entry:'SCHOOL'})
  render(<>{renderer({executionId:'own-declared',mode:'COMPOSITION'})}</>)
  expect(await screen.findByText('固定声明式解释')).toBeInTheDocument()
  expect(screen.getByText('独立指标：')).toBeInTheDocument()
  expect(screen.queryByText('不得显示的声明式解释')).not.toBeInTheDocument()
  expect(screen.queryByText('same')).not.toBeInTheDocument()
 })
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
