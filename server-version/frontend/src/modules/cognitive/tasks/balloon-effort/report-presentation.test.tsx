import React from 'react'
import {afterEach,describe,expect,it,vi} from 'vitest'
import {cleanup,render,screen,within} from '@testing-library/react'
import {EffortReport} from './EffortReport'
import {effortReportFixtures} from './report-fixtures.test-support'
import CognitiveReportVisual from '../../CognitiveReportVisual'
afterEach(()=>{cleanup();vi.unstubAllGlobals()})
const fixtures=effortReportFixtures()
describe('effort public report chart',()=>{
 it('uses exact public denominators, retains true zero, and never puts an invalid result in a chart',()=>{
  const {rerender}=render(<EffortReport report={fixtures.complete}/>)
  expect(fixtures.complete.state).toBe('interpretable')
  const chart=screen.getByRole('img')
  expect(chart).toHaveAccessibleDescription(/基准50次：6\/6有效选择/)
  expect(chart).toHaveAccessibleDescription(/基准100次：0\/6有效选择/)
  expect(within(chart).getByText('0%')).toBeInTheDocument()
  expect(chart.querySelectorAll('.cognitive-reading__bar')).toHaveLength(3)
  rerender(<EffortReport report={fixtures.limited} language="en"/>)
  expect(screen.getByRole('status')).toHaveTextContent('Only the available parts')
  const missing=Object.entries(fixtures.limited.byEffort).find(([,g])=>g.valid===0)![0]
  expect(screen.getByRole('img')).toHaveAccessibleDescription(new RegExp(missing+' presses：No valid choices; no proportion'))
  expect(screen.getByRole('img').querySelectorAll('.cognitive-reading__bar')).toHaveLength(1)
  expect(within(screen.getByRole('img')).getAllByText('—')).toHaveLength(2)
  rerender(<EffortReport report={fixtures.invalid}/>)
  expect(screen.queryByRole('img')).toBeNull()
  expect(screen.getByRole('heading',{level:1})).toHaveTextContent('本次暂时无法形成选择结论')
  expect(screen.queryByText(/基准50次：/)).toBeNull()
 })
 it('keeps the existing shared chart Chinese defaults and supports English without changing signed values',()=>{
  const visual={kind:'metrics' as const,title:'Descriptive difference',unit:'count',points:[{label:'Earlier',value:-2},{label:'Later',value:null}],caption:'Observed data only'}
  const {rerender}=render(<CognitiveReportVisual visual={visual}/>)
  expect(screen.getByText('查看图表数据')).toBeInTheDocument()
  expect(screen.getByRole('img')).toHaveAccessibleDescription(/Earlier：-2；Later：未响应或无效记录/)
  expect(within(screen.getByRole('img')).getByText('—')).toBeInTheDocument()
  rerender(<CognitiveReportVisual visual={visual} language="en"/>)
  expect(screen.getByText('View chart data')).toBeInTheDocument()
  expect(screen.getByRole('img')).toHaveAccessibleDescription(/Earlier：-2；Later：Missing or invalid record/)
 })
 it('wraps English baseline labels at word boundaries on compact displays',()=>{
  vi.stubGlobal('ResizeObserver',class {constructor(private callback:(entries:any[])=>void){} observe(){this.callback([{contentRect:{width:300}}])} disconnect(){}})
  const {container}=render(<CognitiveReportVisual language="en" visual={{kind:'metrics',title:'Choices',unit:'ratio',points:[{label:'200 presses',value:0.5}],caption:'1/2 actual choices'}}/>)
  const words=[...container.querySelectorAll('tspan')].map(node=>node.textContent)
  expect(words).toEqual(['200','presses'])
  expect(words).not.toContain('ses')
  expect(words).not.toContain('200 pres')
 })

})
