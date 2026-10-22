import {act,fireEvent,render,screen,waitFor,within} from '@testing-library/react'
import {afterEach,beforeEach,describe,it,expect,vi} from 'vitest'
import {SurveyToolLibrary} from './SurveyToolLibrary'
import {SurveyBuilder} from './SurveyBuilder'
import {SurveyProjectTools} from './SurveyProjectTools'
import {createInstrumentLibrary} from './instrument-library'
import SurveyApp from './SurveyApp'
vi.mock('./SurveyReportStudio',()=>({SurveyReportStudio:()=>null}))
vi.mock('./SurveyWaveStudio',()=>({SurveyWaveStudio:()=>null}))
vi.mock('./SurveyAnalyticsWorkspace',()=>({SurveyAnalyticsWorkspace:()=>null}))
const tid='b8b5019d-4c3f-44f3-96ab-c4c2f82ec95e'
const form={id:tid,kind:'FORM',title:'学习背景表单',revision:2,status:'DRAFT',updatedAt:'2026-10-22T08:00:00Z',definition:{schemaVersion:1,pages:[]}}
const reply=(data:unknown)=>Promise.resolve({ok:true,json:async()=>({code:0,data})} as Response)
let failSelect=false,selected=false
beforeEach(()=>{window.history.replaceState(null,'','/workspace/tools');failSelect=false;selected=false;vi.stubGlobal('fetch',vi.fn((url:string,init?:RequestInit)=>{
 if(url.endsWith('/auth/me'))return reply({id:'r',username:'researcher',mustChangePassword:false})
 if(url.endsWith('/auth/capabilities'))return reply({analytics:false,publication:true})
 if(url.endsWith('/auth/csrf'))return reply({csrfToken:'synthetic-only'})
 if(url.includes('/projects?page='))return reply({list:[]})
 if(url.includes('/tool-library/catalog'))return reply({list:[{id:'grant',title:'原版认知测验',kind:'COGNITIVE',sourceRef:{sourceVersion:'1',kind:'COGNITIVE',sourceId:'source'}}]})
 if(url.includes('/tool-library?'))return reply({list:[form],total:1})
 if(url.endsWith('/tool-library/'+tid)&&init?.method==='PATCH')return reply({...form,...JSON.parse(String(init.body)),revision:3})
 if(url.endsWith('/tool-library/'+tid))return reply(form)
 if(url.endsWith('/tool-library')&&init?.method==='POST')return reply(form)
 if(url.includes('/tool-library/select/')){if(failSelect)return Promise.reject(new Error('网络响应未确认'));selected=true;return reply({instrumentIds:['copy']})}
 if(url.endsWith('/instruments/copy'))return reply({...form,projectId:'p',instrumentKey:'library_tool'})
 if(url.includes('/instruments?page='))return reply({list:selected?[{...form,id:'copy',instrumentKey:'copy',status:'DRAFT'}]:[]})
 throw new Error('Unexpected '+url)
}))})
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals()})
describe('independent Survey toolkit and study selection',()=>{
 it('presents owned and granted libraries with collapsed help and only supported creation kinds',async()=>{
  render(<SurveyToolLibrary/>);expect(await screen.findByRole('heading',{name:'学习背景表单'})).toBeVisible()
  expect(screen.getByText('选用、版本与开放范围说明').closest('details')).not.toHaveAttribute('open')
  fireEvent.click(screen.getByRole('button',{name:'编制工具'}))
  expect(within(screen.getByLabelText('工具类型')).getAllByRole('option').map(option=>option.textContent)).toEqual(['表单 Form','量表 Scale','普通组合问卷'])
  expect(screen.queryByRole('option',{name:/SJT|认知/})).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button',{name:'已获授权'}));expect(await screen.findByRole('heading',{name:'原版认知测验'})).toBeVisible()
  expect(screen.getByText('来源与使用限制').closest('details')).not.toHaveAttribute('open')
 })
 it('opens independent editing, records the tool URL and retains dirty state on cancelled return',async()=>{
  const confirm=vi.spyOn(window,'confirm').mockReturnValue(false),risk=vi.fn()
  render(<SurveyToolLibrary onLeaveRiskChange={risk}/>);fireEvent.click(await screen.findByRole('button',{name:'编辑'}))
  expect(await screen.findByLabelText('工具名称')).toHaveValue(form.title)
  expect(new URLSearchParams(window.location.search).get('tool')).toBe(tid)
  fireEvent.change(screen.getByLabelText('工具名称'),{target:{value:'尚未保存'}})
  expect(risk).toHaveBeenLastCalledWith({dirty:true,busy:false})
  fireEvent.click(screen.getByRole('button',{name:'工具集'}));expect(confirm).toHaveBeenCalledOnce()
  expect(screen.getByLabelText('工具名称')).toHaveValue('尚未保存')
  fireEvent.click(screen.getByRole('button',{name:'保存工具'}));await waitFor(()=>expect(screen.getByRole('status')).toHaveTextContent('工具草稿已保存'))
  fireEvent.click(screen.getByRole('button',{name:'工具集'}));expect(await screen.findByRole('heading',{name:'工具集'})).toBeVisible()
 })
 it('keeps study tools compact until choosing to add, then refreshes the shared selection list after ACK',async()=>{
  const library=createInstrumentLibrary('p'),risk=vi.fn(),navigate=vi.fn()
  render(<SurveyProjectTools projectId="p" projectStatus="DRAFT" instrumentLibrary={library} onLeaveRiskChange={risk} onNavigateLibrary={navigate}/>)
  expect(await screen.findByText('尚未加入工具，点击“从工具集添加”开始选用。')).toBeVisible()
  expect(screen.queryByRole('button',{name:'我编制的'})).not.toBeInTheDocument()
  expect(screen.getByText('选用与发布说明').closest('details')).not.toHaveAttribute('open')
  fireEvent.click(screen.getByRole('button',{name:'从工具集添加'}));fireEvent.click(await screen.findByRole('button',{name:'加入本研究'}))
  expect(await screen.findByRole('status')).toHaveTextContent('已加入本研究（1 个工具）')
  expect(document.querySelector('.survey-selected-tools')).toHaveTextContent(form.title)
  expect(vi.mocked(fetch).mock.calls.filter(([url,init])=>String(url).includes('/tool-library/select/')&&init?.method==='POST')).toHaveLength(1)
  fireEvent.click(screen.getByRole('button',{name:'收起选用'}));expect(screen.queryByRole('button',{name:'我编制的'})).not.toBeInTheDocument()
 })
 it('retries uncertain selection with the same request identity',async()=>{
  failSelect=true;render(<SurveyToolLibrary projectId="p"/>)
  const add=await screen.findByRole('button',{name:'加入本研究'});fireEvent.click(add)
  expect(await screen.findByRole('alert')).toHaveTextContent('网络响应未确认')
  failSelect=false;fireEvent.click(add);await waitFor(()=>expect(screen.getByRole('status')).toHaveTextContent('已加入本研究'))
  const requests=vi.mocked(fetch).mock.calls.filter(([url])=>String(url).includes('/tool-library/select/')).map(([,init])=>JSON.parse(String(init?.body)))
  expect(requests).toHaveLength(2);expect(requests[0].requestId).toBe(requests[1].requestId)
 })
 it('keeps tool drafts mounted when navigating between top-level destinations, and protects logout',async()=>{
  vi.spyOn(window,'confirm').mockReturnValue(false)
  render(<SurveyApp/>);fireEvent.click(await screen.findByRole('button',{name:'编辑'}));fireEvent.change(await screen.findByLabelText('工具名称'),{target:{value:'独立工具未保存'}})
  const nav=screen.getByRole('navigation',{name:'研究工作台导航'})
  fireEvent.click(within(nav).getByRole('link',{name:'我的研究'}));expect(await screen.findByRole('heading',{name:'研究工作台'})).toBeVisible()
  fireEvent.click(within(nav).getByRole('link',{name:'工具集'}));expect(screen.getByLabelText('工具名称')).toHaveValue('独立工具未保存')
  expect(new URLSearchParams(window.location.search).get('tool')).toBe(tid)
  fireEvent.click(screen.getByRole('button',{name:'退出'}));expect(vi.mocked(fetch).mock.calls.some(([url])=>String(url).endsWith('/auth/logout'))).toBe(false)
  const event=new Event('beforeunload',{cancelable:true});await act(async()=>{window.dispatchEvent(event)});expect(event.defaultPrevented).toBe(true)
 })
})

it('keeps compatibility tools read-only and directs self-authoring back to the independent library',async()=>{
 selected=true
 render(<SurveyBuilder projectId="p" legacyOnly/>)
 fireEvent.click(await screen.findByRole('button',{name:/学习背景表单 FORM/}))
 expect(await screen.findByLabelText('研究工具名称')).toHaveAttribute('readonly')
 expect(screen.queryByRole('button',{name:'创建草稿'})).not.toBeInTheDocument()
 expect(screen.queryByRole('button',{name:'保存草稿'})).not.toBeInTheDocument()
 expect(screen.queryByRole('button',{name:'修订新版本'})).not.toBeInTheDocument()
 expect(screen.getByRole('button',{name:'存入独立工具集'})).toBeVisible()
 expect(screen.getByText('查看选用内容（只读）').closest('details')).not.toHaveAttribute('open')
})
