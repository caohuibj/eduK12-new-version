import {render,screen,fireEvent,waitFor} from '@testing-library/react'
import {describe,it,expect,vi} from 'vitest'
import {SchoolGroupLongitudinal} from './SchoolGroupLongitudinal'
vi.mock('../modules/reporting/ReportTrendChart',()=>({ReportTrendChart:()=> <div>trend</div>}))
const org='school',spec='published-spec',source=(runId:string,name:string)=>({runId,trackId:'track-'+runId,name,resource:{family:'SCALE',key:'scale-A',version:'1'}})
const index={sources:[source('r1','第一页任务')],specs:[{specId:spec,title:'既有群体方案',version:1,metricIds:['score']}],artifacts:[{artifactId:'old-single',generatedAt:'2026-10-01T00:00:00Z'}],nextSourcePage:2,truncated:true}
const projection={planId:'plan',sourceKey:'A',title:'群体纵向报告',wavePopulationLabels:{r1:'冻结乙班'},limitations:[],metrics:[{id:'A-score',label:'A',unit:'score',points:[{waveId:'r1',ordinal:1,label:'T1',observedFrom:null,observedUntil:null,completedN:10,countUnit:'PERSON',validN:10,missingN:0,state:'present',mean:1,sdSample:0,adjacentDelta:null,baselineDelta:null,intermediateMissing:false,populationChanged:null}]}]}
describe('School plan entry integrates existing paged source selection',()=>{
 it('selects a page-two task and sends only its frozen plan, reusing the published GROUP spec and showing original population labels',async()=>{
  const api=vi.fn(async(path:string,method='GET')=>{
   if(path.startsWith('/reports/groups/catalog'))return index
   if(path.startsWith('/reports/groups/sources'))return {sources:[source('r2','第二页任务')],nextSourcePage:null}
   if(path==='/reports/groups/plans/school/r2'&&method==='GET')return {status:'CONFIGURED',planId:'plan',tools:[{key:'A',label:'A',kind:'SCALE'}],waves:[{id:'r1',ordinal:1,title:'T1'},{id:'r2',ordinal:2,title:'T2'}],artifacts:[]}
   if(path==='/reports/groups/plans/school/r2'&&method==='POST')return {artifactId:'combined',generatedAt:'2026-10-30T00:00:00Z',projection}
   throw Error('Unexpected '+path)
  })
  render(<SchoolGroupLongitudinal api={api as any} organizationId={org}/>)
  fireEvent.click(await screen.findByRole('button',{name:'加载更多测评来源'}));await screen.findByRole('option',{name:/第二页任务/})
  fireEvent.change(screen.getByLabelText('测评来源'),{target:{value:'r2:track-r2'}})
  fireEvent.change(screen.getByLabelText('已发布统计方案'),{target:{value:spec}})
  fireEvent.click(await screen.findByRole('button',{name:'打开纵向群体报告'}));await screen.findByLabelText('纵向群体子工具')
  fireEvent.click(screen.getByRole('button',{name:'生成更新版纵向报告'}))
  await screen.findByText('人群：冻结乙班')
  expect(api).toHaveBeenCalledWith('/reports/groups/plans/school/r2','POST',{planId:'plan',sourceKey:'A',throughWaveId:'r2',specId:spec,selection:{kind:'ALL'}})
  expect(api.mock.calls.some(([p])=>p.includes('old-single')||p.includes('/groups/longitudinal'))).toBe(false)
 })
 it('keeps a task without a published plan unavailable and never posts or auto-opens a single report',async()=>{
  const api=vi.fn(async(path:string)=>path.startsWith('/reports/groups/catalog')?index:{status:'NOT_CONFIGURED',tools:[],waves:[],artifacts:[]})
  render(<SchoolGroupLongitudinal api={api as any} organizationId={org}/>)
  await screen.findByRole('option',{name:/第一页任务/});fireEvent.change(screen.getByLabelText('测评来源'),{target:{value:'r1:track-r1'}})
  fireEvent.click(await screen.findByRole('button',{name:'打开纵向群体报告'}))
  await screen.findByText(/此来源没有已正式发布的 longitudinal 计划/)
  await waitFor(()=>expect(api).toHaveBeenCalledTimes(2))
  expect(api.mock.calls.some(([p])=>p.includes('old-single')||p.includes('/groups/longitudinal'))).toBe(false)
 })
})
