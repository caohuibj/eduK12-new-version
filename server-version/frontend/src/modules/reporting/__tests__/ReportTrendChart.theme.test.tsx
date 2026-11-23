import {act,cleanup,render,screen,waitFor} from '@testing-library/react'
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
import type {LongitudinalTrendModel} from '../longitudinalVisualization'
const chart=vi.hoisted(()=>({setOption:vi.fn(),resize:vi.fn(),dispose:vi.fn()}))
const initialize=vi.hoisted(()=>vi.fn())
vi.mock('echarts/core',()=>({use:vi.fn(),init:initialize}))
vi.mock('echarts/charts',()=>({LineChart:{}}))
vi.mock('echarts/components',()=>({GridComponent:{}}))
vi.mock('echarts/renderers',()=>({SVGRenderer:{}}))
import {ReportTrendChart} from '../ReportTrendChart'

const model:LongitudinalTrendModel={metricId:'score',state:'not_comparable',
 points:[{label:'T1',value:7},{label:'T2',value:8},{label:'T3',value:null},{label:'T4',value:10}],
 segments:[{fromIndex:0,toIndex:1,connect:true,comparabilityLevel:'EXACT',delta:1},
  {fromIndex:1,toIndex:2,connect:false,comparabilityLevel:'NOT_COMPARABLE'},
  {fromIndex:2,toIndex:3,connect:false,comparabilityLevel:'NOT_COMPARABLE'}],hasSuppressedValues:true}
function tokens(host:HTMLElement,ink:string){
 for(const [key,value] of Object.entries({ink,action:'#68b08b',muted:'#b5c8bc',line:'#566f60'}))host.style.setProperty('--hui-ds-color-'+key,value)
}
const lastOption=()=>chart.setOption.mock.calls[chart.setOption.mock.calls.length-1][0]
beforeEach(()=>{
 initialize.mockReset().mockReturnValue(chart)
 chart.setOption.mockReset();chart.resize.mockReset();chart.dispose.mockReset()
 vi.spyOn(HTMLElement.prototype,'clientWidth','get').mockReturnValue(480)
 document.documentElement.style.setProperty('--hui-ds-color-ink','#14304a')
})
afterEach(()=>{
 cleanup();vi.restoreAllMocks()
 document.documentElement.style.removeProperty('--hui-ds-color-ink')
})
describe('ReportTrendChart inherited appearance',()=>{
 it('uses the chart host tokens instead of an unrelated root color',async()=>{
  const view=render(<div data-theme="dark"><ReportTrendChart model={model} title="服务端趋势"/></div>)
  const host=view.container.querySelector<HTMLElement>('.report-trend-chart__canvas')!
  tokens(host,'#eef7ef')
  await waitFor(()=>expect(chart.setOption).toHaveBeenCalled())
  const option=lastOption(),series=option.series
  expect(initialize).toHaveBeenCalledWith(host,undefined,{renderer:'svg'})
  expect(series[series.length-1].label.color).toBe('#eef7ef')
  expect(option.xAxis.axisLabel.color).toBe('#b5c8bc')
  expect(option.yAxis.splitLine.lineStyle.color).toBe('#566f60')
 })
 it.each(['data-theme','data-training-theme'])('updates an existing chart when its nearest %s owner changes without changing projected points or segments',async attribute=>{
  const unchanged=JSON.stringify(model)
  const view=render(<div {...{[attribute]:'light'}}><ReportTrendChart model={model} title="服务端趋势"/></div>)
  const owner=view.container.firstElementChild!,host=view.container.querySelector<HTMLElement>('.report-trend-chart__canvas')!
  tokens(host,'#183e2e')
  await waitFor(()=>expect(chart.setOption).toHaveBeenCalledTimes(1))
  const before=lastOption().series.map((series:{data:Array<number|null>})=>series.data)
  // jsdom does not resolve inherited custom properties from theme selectors.
  // Update the computed host tokens, then exercise the real owner mutation.
  tokens(host,'#eef7ef')
  act(()=>owner.setAttribute(attribute,'dark'))
  await waitFor(()=>expect(chart.setOption).toHaveBeenCalledTimes(2))
  const option=lastOption()
  expect(option.series[option.series.length-1].label.color).toBe('#eef7ef')
  expect(option.series.map((series:{data:Array<number|null>})=>series.data)).toEqual(before)
  expect(before).toEqual([[7,8,null,null],[7,8,null,10]])
  expect(JSON.stringify(model)).toBe(unchanged)
  expect(initialize).toHaveBeenCalledTimes(1)
  expect(chart.dispose).not.toHaveBeenCalled()
 })
 it.each(['suppressed','unavailable'] as const)('does not initialize a chart for a %s projection, even when extra values are present',async state=>{
  render(<div data-theme="dark"><ReportTrendChart model={{...model,state}} title="服务端趋势"/></div>)
  expect(screen.getByRole('status')).toBeInTheDocument()
  await act(async()=>{await Promise.resolve()})
  expect(initialize).not.toHaveBeenCalled()
  expect(chart.setOption).not.toHaveBeenCalled()
  expect(document.querySelector('.report-trend-chart__canvas')).toBeNull()
  expect(screen.queryByText('T1')).not.toBeInTheDocument()
 })
})
