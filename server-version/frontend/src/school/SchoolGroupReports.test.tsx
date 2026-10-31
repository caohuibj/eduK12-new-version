import {describe,expect,it,vi} from 'vitest'
import {act,fireEvent,render,screen,waitFor} from '@testing-library/react'
import {SchoolGroupReports} from './SchoolGroupReports'
import type {SchoolApi} from './SchoolRecovery'
const org='org',run='run',track='track',spec='spec'
const leaf={slotKey:'scale:a',unitType:'SCALE',instrumentKey:'a',instrumentVersion:'1',compiledRuntimeHash:'a'.repeat(64)}
const catalog={specs:[{specId:spec,title:'正式方案',version:1,metricIds:['score']}],sources:[{runId:run,trackId:track,name:'任务甲',resource:{family:'BUNDLE',key:'bundle',version:'1'}}],artifacts:[],truncated:false}
const report={artifactId:'artifact',generatedAt:'2026-10-30T00:00:00Z',projection:{title:'学校群体报告',sourceLabel:'工具甲',cutoff:'2026-10-30T00:00:00Z',populationLabel:'冻结子群',completedN:10,countUnit:'PERSON',assignedN:10,tool:{key:'a',title:'甲',kind:'SCALE'},metrics:[{key:'score',label:'score',type:'NUMBER',unit:'score',validN:10,missingN:0,mean:0,sdSample:1,range:null,observedRange:null,qualityCounts:{},measurement:leaf,frequencies:[]}],limitations:['不作因果结论']}}
const tools={tools:[{leaf,metrics:[{key:'score',unit:'score'}]}],groups:{options:[{kind:'CLASSES',id:'class-a',name:'一班',dimensionId:null,dimensionName:null}],limitations:['按任务发布时分组']}}
describe('School group workbench',()=>{
 it('continues an empty filtered source page without reloading the catalog or reports',async()=>{
  const api=vi.fn(async(path:string)=>{
   if(path.includes('/catalog?'))return {...catalog,sources:[],nextSourcePage:2,truncated:true}
   if(path==='/reports/groups/sources?organizationId=org&page=2')return {sources:catalog.sources,nextSourcePage:null}
   throw new Error('Unexpected request: '+path)
  })
  render(<SchoolGroupReports api={api as SchoolApi} organizationId={org}/>)
  fireEvent.click(await screen.findByRole('button',{name:'加载更多测评来源'}))
  expect(await screen.findByRole('option',{name:'任务甲 · bundle'})).toBeInTheDocument()
  expect(screen.queryByRole('button',{name:'加载更多测评来源'})).not.toBeInTheDocument()
  expect(api.mock.calls.map(([path])=>path)).toEqual(['/reports/groups/catalog?organizationId=org','/reports/groups/sources?organizationId=org&page=2'])
 })
 it('generates a selected leaf subgroup and prints the same authorized snapshot',async()=>{
  const api=vi.fn(async(path:string,method='GET')=>path.includes('/catalog')?catalog:path.includes('/tools?')?tools:method==='POST'?report:report)
  const print=vi.spyOn(window,'print').mockImplementation(()=>{})
  render(<SchoolGroupReports api={api as SchoolApi} organizationId={org}/>)
  fireEvent.change(await screen.findByLabelText('测评来源'),{target:{value:'run:track'}})
  fireEvent.click(screen.getByRole('button',{name:'选择工具与人群'}))
  fireEvent.change(await screen.findByLabelText('叶工具与固定版本'),{target:{value:JSON.stringify(leaf)}})
  fireEvent.change(screen.getByLabelText('已发布统计方案'),{target:{value:spec}})
  fireEvent.change(screen.getByLabelText('报告人群'),{target:{value:'CLASSES'}})
  fireEvent.click(screen.getByLabelText('一班'))
  fireEvent.click(screen.getByRole('button',{name:'生成更新版报告'}))
  await screen.findByRole('article',{name:'群体报告阅读'})
  expect(api).toHaveBeenCalledWith('/reports/groups','POST',{organizationId:org,runId:run,trackId:track,specId:spec,leaf,selection:{kind:'CLASSES',ids:['class-a']}})
  fireEvent.click(screen.getByRole('button',{name:'打印 / 保存 PDF'}));expect(print).toHaveBeenCalledOnce();print.mockRestore()
 })
 it('reopens the latest artifact without discovering sources or recalculating',async()=>{
  const api=vi.fn(async(path:string)=>path.includes('/catalog')?{...catalog,artifacts:[{artifactId:'artifact',generatedAt:report.generatedAt}]}:report)
  render(<SchoolGroupReports api={api as SchoolApi} organizationId={org}/>)
  await screen.findByRole('article',{name:'群体报告阅读'})
  expect(api.mock.calls).toEqual([['/reports/groups/catalog?organizationId=org'],['/reports/groups/org/artifact']])
 })
 it('recovers a failed catalogue request with a GET only',async()=>{
  const api=vi.fn().mockRejectedValueOnce(Error('目录读取失败')).mockResolvedValue(catalog)
  render(<SchoolGroupReports api={api as SchoolApi} organizationId={org}/>)
  expect(await screen.findByRole('alert')).toHaveTextContent('目录读取失败')
  fireEvent.click(screen.getByRole('button',{name:'重新读取报告目录'}))
  await screen.findByLabelText('测评来源')
  expect(api.mock.calls).toEqual([['/reports/groups/catalog?organizationId=org'],['/reports/groups/catalog?organizationId=org']])
 })
 it('does not restore a previous school from a late response',async()=>{
  let resolve!:(value:typeof catalog)=>void
  const pending=new Promise<typeof catalog>(yes=>{resolve=yes})
  const api=vi.fn(async(path:string)=>path.endsWith('organizationId=org')?pending:{...catalog,sources:[]})
  const view=render(<SchoolGroupReports api={api as SchoolApi} organizationId={org}/>)
  view.rerender(<SchoolGroupReports api={api as SchoolApi} organizationId="other"/>)
  await waitFor(()=>expect(api).toHaveBeenLastCalledWith('/reports/groups/catalog?organizationId=other'))
  await act(async()=>resolve(catalog))
  expect(screen.queryByRole('option',{name:/任务甲/})).not.toBeInTheDocument()
 })
})
