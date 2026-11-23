import {act,fireEvent,render,screen,within} from '@testing-library/react'
import {describe,it,expect,vi} from 'vitest'
import {EducationTrackingPublish} from '../EducationPersonalTracking'
const choices=[{trackId:'task',itemId:'a',scoreKey:'total',label:'A Total',unit:'points',visible:true},{trackId:'task',itemId:'b',scoreKey:'total',label:'B Total',unit:'points',visible:false}]
describe('Education tracking plan versus own numeric disclosure',()=>{
 it.each(['SCHOOL','TEACHER'] as const)('%s explains a server-ineligible report and publishes receipt-only without inferring from metric choices',async entry=>{
  const reason='所选工具未配置作答者报告，请使用仅回执模式发布。'
  const api=vi.fn(async()=>({baselineId:null,ordinal:null,choices,participantReport:{eligible:false,reason}})),publish=vi.fn()
  render(<EducationTrackingPublish api={api as any} path="/data-only" entry={entry} publish={publish} disabled={false}/>)
  const report=await screen.findByRole('checkbox',{name:'向作答者提供报告（普通自评整卷）'})
  expect(report).toBeDisabled();expect(report).not.toBeChecked()
  expect(report).toHaveAccessibleDescription(reason)
  fireEvent.click(report)
  fireEvent.click(screen.getByRole('button',{name:entry==='SCHOOL'?'正式发布本人测评':'发布教师评价任务'}))
  expect(publish).toHaveBeenCalledWith({mode:'SINGLE',metrics:[],visibleMetrics:[]},false)
 })
 it.each(['SCHOOL','TEACHER'] as const)('%s keeps an eligible report selectable even when there are no longitudinal choices',async entry=>{
  const api=vi.fn(async()=>({baselineId:null,ordinal:null,choices:[],participantReport:{eligible:true,reason:null}})),publish=vi.fn()
  render(<EducationTrackingPublish api={api as any} path="/eligible" entry={entry} publish={publish} disabled={false}/>)
  const report=await screen.findByRole('checkbox',{name:'向作答者提供报告（普通自评整卷）'})
  expect(report).toBeEnabled();fireEvent.click(report);expect(report).toBeChecked()
  fireEvent.click(screen.getByRole('button',{name:entry==='SCHOOL'?'正式发布本人测评':'发布教师评价任务'}))
  expect(publish).toHaveBeenCalledWith({mode:'SINGLE',metrics:[],visibleMetrics:[]},true)
 })
 it('ignores an eligible former source response after switching to a data-only source',async()=>{
  let finish!:(value:unknown)=>void
  const old=vi.fn(()=>new Promise(resolve=>{finish=resolve})),publish=vi.fn()
  const current=vi.fn(async()=>({baselineId:null,ordinal:null,choices:[],participantReport:{eligible:false,reason:'本来源仅提供回执'}}))
  const view=render(<EducationTrackingPublish api={old as any} path="/old" publish={publish} disabled={false}/>)
  view.rerender(<EducationTrackingPublish api={current as any} path="/current" publish={publish} disabled={false}/>)
  const report=await screen.findByRole('checkbox',{name:'向作答者提供报告（普通自评整卷）'})
  expect(report).toBeDisabled()
  await act(async()=>finish({baselineId:null,ordinal:null,choices,participantReport:{eligible:true,reason:null}}))
  expect(report).toBeDisabled();expect(report).toHaveAccessibleDescription('本来源仅提供回执')
  expect(publish).not.toHaveBeenCalled()
 })
 it('keeps both leaf totals in the plan while explicit empty own visibility hides all',async()=>{
  const api=vi.fn(async()=>({baselineId:null,ordinal:null,choices})),publish=vi.fn()
  render(<EducationTrackingPublish api={api as any} path="/task" entry="SCHOOL" publish={publish} disabled={false}/>)
  fireEvent.change(await screen.findByRole('combobox',{name:'学生测量模式'}),{target:{value:'LONGITUDINAL'}})
  const plan=screen.getByRole('group',{name:'追踪的子工具指标（同一投放）'})
  for(const box of within(plan).getAllByRole('checkbox'))fireEvent.click(box)
  const visible=screen.getByRole('group',{name:'本轮本人可见指标'}),boxes=within(visible).getAllByRole('checkbox')
  expect(boxes[0]).toBeChecked();expect(boxes[1]).toBeDisabled();expect(boxes[1]).not.toBeChecked()
  fireEvent.click(boxes[0]);fireEvent.click(screen.getByRole('button',{name:'正式发布本人测评'}))
  expect(publish).toHaveBeenCalledWith({mode:'LONGITUDINAL',metrics:choices.map(({trackId,itemId,scoreKey})=>({trackId,itemId,scoreKey})),visibleMetrics:[]},false)
 })
 it('keeps inherited metrics locked and does not restore a previously hidden metric implicitly',async()=>{
  const api=vi.fn(async()=>({baselineId:'T1',ordinal:2,choices:[{...choices[0],selectedVisible:true},{...choices[1],visible:true,selectedVisible:false}]})),publish=vi.fn()
  render(<EducationTrackingPublish api={api as any} path="/t2" publish={publish} disabled={false}/>)
  const visible=await screen.findByRole('group',{name:'本轮本人可见指标'}),boxes=within(visible).getAllByRole('checkbox')
  expect(screen.queryByRole('combobox')).not.toBeInTheDocument();expect(boxes[0]).toBeChecked();expect(boxes[1]).not.toBeChecked()
  fireEvent.click(boxes[0]);fireEvent.click(screen.getByRole('button',{name:'发布教师评价任务'}))
  expect(publish.mock.calls[0][0].metrics).toHaveLength(2);expect(publish.mock.calls[0][0].visibleMetrics).toEqual([])
 })
 it('drops the prior source choices while another authenticated source is loading',async()=>{
  const first=vi.fn(async()=>({baselineId:null,ordinal:null,choices})),publish=vi.fn();let done!:(value:unknown)=>void
  const second=vi.fn(()=>new Promise(resolve=>{done=resolve}))
  const view=render(<EducationTrackingPublish api={first as any} path="/first" publish={publish} disabled={false}/>)
  fireEvent.change(await screen.findByRole('combobox'),{target:{value:'LONGITUDINAL'}});expect(screen.getByText('A Total（points）')).toBeInTheDocument()
  view.rerender(<EducationTrackingPublish api={second as any} path="/second" publish={publish} disabled={false}/>)
  expect(screen.queryByText('A Total（points）')).not.toBeInTheDocument();expect(screen.queryByRole('button',{name:'发布教师评价任务'})).not.toBeInTheDocument()
  await act(async()=>done({baselineId:null,ordinal:null,choices:[]}));expect(await screen.findByRole('combobox')).toHaveValue('SINGLE')
 })
})
