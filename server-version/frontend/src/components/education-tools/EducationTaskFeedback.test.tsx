import { StrictMode } from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { EducationTaskFeedback, type EducationFeedbackData } from './EducationTaskFeedback'
import type { EducationReportApi } from './EducationScalePersonalReport'

const api=vi.fn() as EducationReportApi
const deferred=()=>{let resolve!:(data:EducationFeedbackData)=>void;const promise=new Promise<EducationFeedbackData>(r=>{resolve=r});return {promise,resolve}}
const props=(loadFeedback:()=>Promise<EducationFeedbackData>)=>({api,entry:'SCHOOL' as const,executionId:'one',title:'我的测评',loadFeedback,onClose:vi.fn()})
const report=(value=7)=>({schemaVersion:1,kind:'EDUCATION_ASSESSMENT_PERSONAL_REPORT',state:'READY',mode:'INDIVIDUAL_SUMMARY',reports:[{
  itemId:'cognitive',family:'COGNITIVE',status:'READY',rendered:{generatorVersion:'DECLARATIVE_REPORT_V1',title:'已批准学生报告',blocks:[
    {type:'TEXT',text:'依照获准模板显示'},
    {type:'METRIC',metricKey:'private_internal_code',label:'本次测评记录',display:'RAW',value,status:'INTERPRETABLE',unit:'次'},
    {type:'ASSET',assetId:'secret-asset',alt:'获准图示说明',url:'https://training.invalid/private'},
  ],limitations:['这是一次测评记录，不是诊断。'],disclaimer:null},
}]})

describe('education completion feedback lifecycle',()=>{
  it('reuses a single read through StrictMode and renders approved declared content without a media URL',async()=>{
    const load=vi.fn().mockResolvedValue(report())
    render(<StrictMode><EducationTaskFeedback {...props(load)}/></StrictMode>)
    expect(await screen.findByText('依照获准模板显示')).toBeInTheDocument()
    expect(load).toHaveBeenCalledTimes(1)
    expect(screen.getByText('本次作答已完成，正式提交已确认。')).toBeInTheDocument()
    expect(screen.getByText('本次测评记录：')).toHaveTextContent('7')
    expect(screen.queryByText('private_internal_code')).not.toBeInTheDocument()
    expect(document.querySelector('img,video,iframe')).toBeNull()
    expect(document.querySelector('[href*="training.invalid"]')).toBeNull()
  })
  it.each(['PENDING','WITHHELD','COMPLETED'])('retains completion for %s without numeric rendering or polling',async state=>{
    const load=vi.fn().mockResolvedValue({...report(999),state})
    render(<EducationTaskFeedback {...props(load)}/>)
    await waitFor(()=>expect(screen.getByRole('button',{name:'重新读取反馈'})).toBeEnabled())
    expect(screen.getByText('本次作答已完成，正式提交已确认。')).toBeInTheDocument()
    expect(screen.queryByText('999')).not.toBeInTheDocument()
    expect(screen.queryByText('依照获准模板显示')).not.toBeInTheDocument()
    expect(load).toHaveBeenCalledTimes(1)
  })
  it('keeps accepted completion after a read failure and only retries on user action',async()=>{
    const load=vi.fn().mockRejectedValueOnce(Error('403 private backend detail')).mockResolvedValueOnce(report())
    render(<EducationTaskFeedback {...props(load)}/>)
    expect(await screen.findByRole('alert')).toHaveTextContent('作答已完成')
    expect(screen.queryByText(/403 private/)).not.toBeInTheDocument()
    expect(load).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button',{name:'重试读取反馈'}))
    await screen.findByText('依照获准模板显示')
    expect(load).toHaveBeenCalledTimes(2)
  })
  it('removes a previously readable report before refreshing revoked permission',async()=>{
    const next=deferred(),load=vi.fn().mockResolvedValueOnce(report()).mockImplementationOnce(()=>next.promise)
    render(<EducationTaskFeedback {...props(load)}/>)
    await screen.findByText('依照获准模板显示')
    fireEvent.click(screen.getByRole('button',{name:'重新读取反馈'}))
    expect(screen.queryByText('依照获准模板显示')).not.toBeInTheDocument()
    await act(async()=>{next.resolve({kind:'EDUCATION_ASSESSMENT_PERSONAL_REPORT',schemaVersion:1,state:'WITHHELD'});await next.promise})
    expect(screen.getByText(/当前反馈尚未获准显示/)).toBeInTheDocument()
    expect(screen.queryByText('本次测评记录：')).not.toBeInTheDocument()
  })
  it.each(['task','identity'])('discards a late report after %s changes',async change=>{
    const old=deferred(),first=props(()=>old.promise),next=props(vi.fn().mockResolvedValue({state:'COMPLETED'}))
    if(change==='identity')next.api=vi.fn() as EducationReportApi
    else next.executionId='two'
    const {rerender}=render(<EducationTaskFeedback {...first}/>)
    await waitFor(()=>expect(screen.getByText('正在读取获准反馈…')).toBeInTheDocument())
    rerender(<EducationTaskFeedback {...next}/>)
    await waitFor(()=>expect(screen.getByRole('button',{name:'重新读取反馈'})).toBeEnabled())
    await act(async()=>{old.resolve(report(999));await old.promise})
    expect(screen.queryByText('依照获准模板显示')).not.toBeInTheDocument()
    expect(screen.queryByText('999')).not.toBeInTheDocument()
  })
  it('allows keyboard close while pending and rejects its late reply',async()=>{
    const late=deferred(),options=props(()=>late.promise)
    const {container}=render(<EducationTaskFeedback {...options}/>)
    await waitFor(()=>expect(container.querySelector('h3')).toHaveFocus())
    fireEvent.keyDown(screen.getByRole('region'),{key:'Escape'})
    expect(options.onClose).toHaveBeenCalledTimes(1)
    await act(async()=>{late.resolve(report());await late.promise})
    expect(screen.queryByText('依照获准模板显示')).not.toBeInTheDocument()
  })
  it('never renders unknown/older raw metric payloads as a declared education report',async()=>{
    render(<EducationTaskFeedback {...props(vi.fn().mockResolvedValue({...report(999),schemaVersion:2}))}/>)
    await waitFor(()=>expect(screen.getByRole('button',{name:'重新读取反馈'})).toBeEnabled())
    expect(screen.queryByText('依照获准模板显示')).not.toBeInTheDocument()
  })
})

it('shows honest missing-threshold and per-tool unavailable messages in an approved report',async()=>{
 const data=report()
 Object.assign(data.reports[0],{message:'当前没有适用且获准的参考或阈值，未作等级与阈值解释。'})
 data.reports.push({itemId:'sjt',family:'SJT',status:'NOT_SELECTED',rendered:null} as unknown as typeof data.reports[number])
 render(<EducationTaskFeedback {...props(vi.fn().mockResolvedValue(data))}/>)
 expect(await screen.findByText('当前没有适用且获准的参考或阈值，未作等级与阈值解释。')).toBeInTheDocument()
 expect(screen.getByText('该工具未选择获准的报告版本。')).toBeInTheDocument()
})
