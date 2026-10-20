import {fireEvent,render,screen,waitFor} from '@testing-library/react'
import {afterEach,describe,expect,it,vi} from 'vitest'
import {SurveyStoredReportReader} from './SurveyStoredReportReader'
const list=()=>({list:[{finalId:'final-a',attemptCode:'R-001',completedAt:'2026-10-20T00:00:00Z',reports:[{instrumentKey:'scale',measurementRelease:{releaseId:'m'},reportRelease:{releaseId:'r'},status:'READY'}]}],nextAfterId:'next'})
const view=()=>({accessAudience:'researcher',intendedAudience:'student',sourceFinalHash:'final-hash',contentBindingHash:'binding-hash',reportRelease:{releaseId:'r'},interpretationSemantics:'SAVED_AT_FINAL_NO_RECALCULATION',lifecycleNotices:[{layer:'REFERENCE',releaseId:'ref',status:'REVOKED'}],report:{title:'Saved report',blocks:[{type:'TEXT',text:'<script>alert(1)</script>'},{type:'METRIC',metricKey:'score',value:3,unit:'points'},{type:'REFERENCE_BAND',text:'Saved band',guidance:['Saved guidance']},{type:'CHART',metrics:[{metricKey:'chart-score',value:4,unit:'points'}]},{type:'ASSET',assetId:'secret',alt:'Licensed image'}],limitations:['Limit'],disclaimer:'Descriptive only'}})
afterEach(()=>vi.restoreAllMocks())
describe('researcher exact saved report component',()=>{
 it('loads bounded pointers only on demand, then requests the exact FINAL and instrument',async()=>{
  const request=vi.fn(async(path:string)=>path.includes('/finals/')?view():list())
  const {container}=render(<SurveyStoredReportReader projectId="project" waveId="wave" request={request as any}/>)
  expect(request).not.toHaveBeenCalled();fireEvent.click(screen.getByRole('button',{name:'读取报告列表'}))
  await screen.findByText('R-001',{exact:false});expect(request).toHaveBeenLastCalledWith('/projects/project/analytics/waves/wave/reports')
  fireEvent.click(screen.getByRole('button',{name:'查看 scale 报告'}));await screen.findByText('Saved report')
  expect(request).toHaveBeenLastCalledWith('/projects/project/analytics/waves/wave/finals/final-a/reports/scale')
  expect(screen.getByText('<script>alert(1)</script>')).toBeTruthy();expect(container.querySelector('script')).toBeNull()
  expect(container.querySelector('img')).toBeNull();expect(screen.getByText(/Licensed image/)).toBeTruthy()
  expect(screen.getByText('Saved guidance')).toBeTruthy();expect(screen.getByText('chart-score')).toBeTruthy()
  expect(screen.getByText(/REFERENCE ref.*REVOKED/)).toBeTruthy();expect(screen.getByText(/模板受众 student/)).toBeTruthy()
  fireEvent.click(screen.getByRole('button',{name:'下一页报告记录'}));await waitFor(()=>expect(request).toHaveBeenLastCalledWith('/projects/project/analytics/waves/wave/reports?afterId=next'))
  expect(screen.queryByLabelText('精确 FINAL 报告')).toBeNull()
 })
 it('clears prior sensitive report/list on a current permission failure',async()=>{
  const request=vi.fn(async(path:string)=>path.includes('/finals/')?view():list())
  render(<SurveyStoredReportReader projectId="project" waveId="wave" request={request as any}/>)
  fireEvent.click(screen.getByRole('button',{name:'读取报告列表'}));await screen.findByText('R-001',{exact:false})
  fireEvent.click(screen.getByRole('button',{name:'查看 scale 报告'}));await screen.findByText('Saved report')
  request.mockRejectedValueOnce(new Error('当前数据权限已失效'))
  fireEvent.click(screen.getByRole('button',{name:'读取报告列表'}));await screen.findByRole('alert')
  expect(screen.queryByLabelText('精确 FINAL 报告')).toBeNull();expect(screen.queryByText('R-001',{exact:false})).toBeNull()
 })
 it('ignores a response arriving after project/wave navigation',async()=>{
  let resolve!:(value:any)=>void;const request=vi.fn(()=>new Promise(r=>{resolve=r}))
  const ui=render(<SurveyStoredReportReader projectId="old" waveId="wave" request={request as any}/>)
  fireEvent.click(screen.getByRole('button',{name:'读取报告列表'}))
  ui.rerender(<SurveyStoredReportReader projectId="new" waveId="wave" request={request as any}/>)
  resolve(list());await waitFor(()=>expect(screen.getByRole('button',{name:'读取报告列表'}).hasAttribute('disabled')).toBe(false))
  expect(screen.queryByText('R-001',{exact:false})).toBeNull()
 })
 it('does not offer an unavailable report as a ready rendering',async()=>{
  const data=list();data.list[0].reports[0].status='UNAVAILABLE'
  render(<SurveyStoredReportReader projectId="project" waveId="wave" request={vi.fn(async()=>data) as any}/>)
  fireEvent.click(screen.getByRole('button',{name:'读取报告列表'}));await screen.findByText('R-001',{exact:false})
  expect(screen.getByRole('button',{name:'查看 scale 报告'}).hasAttribute('disabled')).toBe(true)
 })
})
