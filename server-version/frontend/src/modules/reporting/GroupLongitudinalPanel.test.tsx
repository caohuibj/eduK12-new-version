import {render,screen,fireEvent,waitFor,act} from '@testing-library/react'
import {describe,it,expect,vi} from 'vitest'
import {GroupLongitudinalPanel} from './GroupLongitudinalPanel'
vi.mock('./ReportTrendChart',()=>({ReportTrendChart:()=> <div>trend</div>}))
const artifact={artifactId:'version1',generatedAt:'2026-10-30T00:00:00Z',projection:{planId:'plan',sourceKey:'A',title:'群体纵向报告',limitations:[],metrics:[{id:'A-total',label:'A',unit:'raw',points:[{waveId:'T1',ordinal:1,label:'baseline',observedFrom:null,observedUntil:null,completedN:5,countUnit:'PERSON',validN:5,missingN:0,state:'present',mean:0,sdSample:0,adjacentDelta:null,baselineDelta:null,intermediateMissing:false,populationChanged:null},{waveId:'T2',ordinal:2,label:'current',observedFrom:null,observedUntil:null,completedN:6,countUnit:'PERSON',validN:6,missingN:0,state:'present',mean:2,sdSample:1,adjacentDelta:2,baselineDelta:2,intermediateMissing:false,populationChanged:true}]}]}}
const catalog={status:'CONFIGURED',planId:'plan',tools:[{key:'A',label:'A',kind:'SCALE'}],waves:[{id:'T1',ordinal:1,title:'baseline'},{id:'T2',ordinal:2,title:'current'}],artifacts:[{artifactId:'version1',generatedAt:artifact.generatedAt}]}
describe('group longitudinal manager panel scope',()=>{
 it('generates explicitly and clears a stored report on a failed permission read',async()=>{
  const request=vi.fn().mockResolvedValueOnce(catalog).mockResolvedValueOnce(artifact).mockResolvedValueOnce({...artifact,artifactId:'version2'}).mockRejectedValueOnce(new Error('来源不可访问'))
  render(<GroupLongitudinalPanel base="/plan-A" request={request as any}/>);expect(request).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button',{name:'打开纵向群体报告'}));await screen.findByRole('article',{name:'群体纵向报告'})
  expect(screen.getAllByText('+2')).toHaveLength(2);expect(screen.getByText('完成样本人群组成有变化')).toBeTruthy()
  fireEvent.click(screen.getByRole('button',{name:'生成更新版纵向报告'}))
  await waitFor(()=>expect(request).toHaveBeenCalledWith('/plan-A','POST',{planId:'plan',sourceKey:'A',throughWaveId:'T2'}))
  await waitFor(()=>expect((screen.getByLabelText('纵向群体历史版本') as HTMLSelectElement).value).toBe('version2'))
  fireEvent.change(screen.getByLabelText('纵向群体历史版本'),{target:{value:'version1'}})
  await screen.findByRole('alert');expect(screen.queryByRole('article',{name:'群体纵向报告'})).toBeNull()
 })
 it('ignores a late response after switching to another source',async()=>{
  let finish!:(v:unknown)=>void;const request=vi.fn().mockImplementation(()=>new Promise(resolve=>{finish=resolve}))
  const ui=render(<GroupLongitudinalPanel base="/old" request={request as any}/>);fireEvent.click(screen.getByRole('button',{name:'打开纵向群体报告'}))
  ui.rerender(<GroupLongitudinalPanel base="/new" request={request as any}/>);await act(async()=>finish(catalog))
  expect(screen.queryByLabelText('纵向群体子工具')).toBeNull();expect(request).toHaveBeenCalledTimes(1)
 })
})
