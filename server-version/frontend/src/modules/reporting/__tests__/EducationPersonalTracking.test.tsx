import {act,fireEvent,render,screen,within} from '@testing-library/react'
import {describe,it,expect,vi} from 'vitest'
import {EducationTrackingPublish} from '../EducationPersonalTracking'
const choices=[{trackId:'task',itemId:'a',scoreKey:'total',label:'A Total',unit:'points',visible:true},{trackId:'task',itemId:'b',scoreKey:'total',label:'B Total',unit:'points',visible:false}]
describe('Education tracking plan versus own numeric disclosure',()=>{
 it('keeps both leaf totals in the plan while explicit empty own visibility hides all',async()=>{
  const api=vi.fn(async()=>({baselineId:null,ordinal:null,choices})),publish=vi.fn()
  render(<EducationTrackingPublish api={api as any} path="/task" entry="SCHOOL" publish={publish} disabled={false}/>)
  fireEvent.change(await screen.findByRole('combobox',{name:'学生测量模式'}),{target:{value:'LONGITUDINAL'}})
  const plan=screen.getByRole('group',{name:'追踪的子工具指标（同一投放）'})
  for(const box of within(plan).getAllByRole('checkbox'))fireEvent.click(box)
  const visible=screen.getByRole('group',{name:'本轮本人可见指标'}),boxes=within(visible).getAllByRole('checkbox')
  expect(boxes[0]).toBeChecked();expect(boxes[1]).toBeDisabled();expect(boxes[1]).not.toBeChecked()
  fireEvent.click(boxes[0]);fireEvent.click(screen.getByRole('button',{name:'正式发布本人测评'}))
  expect(publish).toHaveBeenCalledWith({mode:'LONGITUDINAL',metrics:choices.map(({trackId,itemId,scoreKey})=>({trackId,itemId,scoreKey})),visibleMetrics:[]})
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
