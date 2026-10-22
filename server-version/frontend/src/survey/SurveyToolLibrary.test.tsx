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
 if(url.endsWith('/tool-library/'+tid)&&init?.method==='PATCH'){const data=JSON.parse(String(init.body));return reply({...form,...data,revision:data.revision+1})}
 if(url.endsWith('/tool-library/'+tid))return reply(form)
 if(/\/tool-library\/[a-f0-9-]{36}$/.test(url)){const id=url.split('/').pop();const call=vi.mocked(fetch).mock.calls.find(([endpoint,opts])=>String(endpoint).endsWith('/tool-library')&&opts?.method==='POST'&&JSON.parse(String(opts.body)).requestId===id);if(call){const data=JSON.parse(String(call[1]?.body));return reply({...form,id,kind:data.kind,title:data.title,revision:0,definition:data.kind==='FORM'?{schemaVersion:2,pages:[]}:data.kind==='COMPOSITION'?{schemaVersion:1,items:[]}:{schemaVersion:1,items:[],responseOptions:[],dimensions:[],aggregation:'mean',respondentType:'participant_self_report'},...(init?.method==='PATCH'?{...JSON.parse(String(init.body)),revision:1}:{})})}}
 if(url.endsWith('/tool-library')&&init?.method==='POST'){const body=JSON.parse(String(init.body));return reply({...form,id:body.requestId,kind:body.kind,title:body.title,revision:0,definition:body.kind==='FORM'?{schemaVersion:2,pages:[]}:body.kind==='COMPOSITION'?{schemaVersion:1,items:[]}:{schemaVersion:1,items:[],responseOptions:[],dimensions:[],aggregation:'mean',respondentType:'participant_self_report'}})}
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
  expect(within(screen.getByRole('group',{name:'选择要编制的工具'})).getAllByRole('button').map(button=>button.textContent)).toEqual(['量表设置维度、计分与反馈','表单编写题目、分页与显示条件','普通组合问卷按顺序组合已有工具'])
  expect(screen.queryByLabelText('工具类型')).not.toBeInTheDocument()
  expect(screen.queryByRole('button',{name:'创建草稿'})).not.toBeInTheDocument()
  expect(screen.queryByRole('option',{name:/SJT|认知/})).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button',{name:'已获授权'}));expect(await screen.findByRole('heading',{name:'原版认知测验'})).toBeVisible()
  expect(screen.getByText('来源与使用限制').closest('details')).not.toHaveAttribute('open')
 })
 it.each([['表单','FORM'],['量表','SCALE'],['普通组合问卷','COMPOSITION']])('enters %s editing directly after choosing the type',async(label,kind)=>{
  render(<SurveyToolLibrary/>);fireEvent.click(await screen.findByRole('button',{name:'编制工具'}))
  fireEvent.click(within(screen.getByRole('group',{name:'选择要编制的工具'})).getByRole('button',{name:new RegExp('^'+label)}))
  expect(await screen.findByRole('heading',{name:kind==='FORM'?'未命名表单':label+'编制'})).toBeVisible()
  expect(screen.getByLabelText('工具名称')).toHaveValue(kind==='COMPOSITION'?'未命名组合问卷':'未命名'+label)
  const writes=vi.mocked(fetch).mock.calls.filter(([url,init])=>String(url).endsWith('/tool-library')&&init?.method==='POST')
  expect(writes).toHaveLength(1);expect(JSON.parse(String(writes[0][1]?.body))).toMatchObject({kind})
  expect(new URLSearchParams(window.location.search).get('tool')).toBe(JSON.parse(String(writes[0][1]?.body)).requestId)
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  if(kind==='FORM'){expect(screen.queryByText(/旧版兼容表单/)).not.toBeInTheDocument();expect(screen.getByRole('combobox',{name:'选择题型'}).querySelectorAll('option')).toHaveLength(13)}
 })
 it('opens form naming only on request and closes it after saving without blocking questions',async()=>{
  render(<SurveyToolLibrary/>);fireEvent.click(await screen.findByRole('button',{name:'编制工具'}));fireEvent.click(screen.getByRole('button',{name:/^表单\s+编写/}));await screen.findByRole('heading',{name:'未命名表单'})
  const toggle=screen.getByRole('button',{name:'编辑名称'});expect(toggle).toHaveAttribute('aria-expanded','false');expect(screen.getByLabelText('工具名称')).not.toBeVisible();fireEvent.click(toggle)
  fireEvent.change(screen.getByLabelText('工具名称'),{target:{value:'课堂反馈'}})
  expect(toggle).toHaveAttribute('aria-expanded','true');expect(screen.getByRole('button',{name:'保存表单信息'})).toBeVisible()
  expect(screen.getByRole('textbox',{name:'题干'})).toBeDisabled()
  fireEvent.click(screen.getByRole('button',{name:'保存表单信息'}))
  await waitFor(()=>expect(screen.getByRole('textbox',{name:'题干'})).toBeEnabled())
  expect(screen.getByLabelText('工具名称')).toHaveValue('课堂反馈');expect(toggle).toHaveAttribute('aria-expanded','false');expect(screen.getByLabelText('工具名称')).not.toBeVisible()
 })
 it('retries an unconfirmed direct creation with the same identity and blocks other kinds',async()=>{
  const original=vi.mocked(fetch).getMockImplementation()!;let fail=true
  vi.mocked(fetch).mockImplementation((url,init)=>String(url).endsWith('/tool-library')&&init?.method==='POST'&&fail?Promise.reject(new Error('响应未确认')):original(url,init))
  render(<SurveyToolLibrary/>);fireEvent.click(await screen.findByRole('button',{name:'编制工具'}));fireEvent.click(screen.getByRole('button',{name:/^表单\s+编写/}))
  expect(await screen.findByRole('alert')).toHaveTextContent('响应未确认')
  expect(screen.getByRole('button',{name:/^量表\s+设置/})).toBeDisabled();fail=false
  fireEvent.click(screen.getByRole('button',{name:/^重试进入表单/}));expect(await screen.findByRole('heading',{name:'未命名表单'})).toBeVisible()
  const writes=vi.mocked(fetch).mock.calls.filter(([url,init])=>String(url).endsWith('/tool-library')&&init?.method==='POST').map(([,init])=>JSON.parse(String(init?.body)))
  expect(writes).toHaveLength(2);expect(writes[0]).toEqual(writes[1])
 })
 it('opens independent editing, records the tool URL and retains dirty state on cancelled return',async()=>{
  const confirm=vi.spyOn(window,'confirm').mockReturnValue(false),risk=vi.fn()
  render(<SurveyToolLibrary onLeaveRiskChange={risk}/>);fireEvent.click(await screen.findByRole('button',{name:'编辑'}))
  expect(await screen.findByLabelText('工具名称')).toHaveValue(form.title)
  expect(new URLSearchParams(window.location.search).get('tool')).toBe(tid)
  expect(screen.getByRole('heading',{name:form.title})).toBeVisible()
  expect(screen.getByRole('button',{name:'编辑名称'})).toHaveAttribute('aria-expanded','false')
  expect(screen.getByLabelText('工具名称')).not.toBeVisible()
  expect(screen.getByText('编制与使用说明').compareDocumentPosition(screen.getByRole('heading',{name:/题目编辑/}))).toBe(Node.DOCUMENT_POSITION_PRECEDING)
  fireEvent.click(screen.getByRole('button',{name:'编辑名称'}));fireEvent.change(screen.getByLabelText('工具名称'),{target:{value:'尚未保存'}})
  expect(risk).toHaveBeenLastCalledWith({dirty:true,busy:false})
  fireEvent.click(screen.getByRole('button',{name:'工具集'}));expect(confirm).toHaveBeenCalledOnce()
  expect(screen.getByLabelText('工具名称')).toHaveValue('尚未保存')
  fireEvent.click(screen.getByRole('button',{name:'编辑名称'}));expect(screen.getByLabelText('工具名称')).not.toBeVisible()
  fireEvent.click(screen.getByRole('button',{name:'编辑名称'}));expect(screen.getByLabelText('工具名称')).toHaveValue('尚未保存')
  fireEvent.click(screen.getByRole('button',{name:'保存表单信息'}));await waitFor(()=>expect(screen.getByRole('status')).toHaveTextContent('工具草稿已保存'))
  fireEvent.click(screen.getByRole('button',{name:'工具集'}));expect(await screen.findByRole('heading',{name:'工具集'})).toBeVisible()
 })
 it('persists Form question edits immediately and protects an unfinished question',async()=>{
  vi.spyOn(window,'confirm').mockReturnValue(false);const risk=vi.fn()
  render(<SurveyToolLibrary onLeaveRiskChange={risk}/>);fireEvent.click(await screen.findByRole('button',{name:'编辑'}));await screen.findByRole('heading',{name:form.title})
  fireEvent.click(screen.getByText(/旧版兼容表单/));fireEvent.click(screen.getByRole('button',{name:'启用扩展题型'}))
  await waitFor(()=>expect(screen.queryByText(/旧版兼容表单/)).not.toBeInTheDocument())
  fireEvent.change(screen.getByRole('combobox',{name:'选择题型'}),{target:{value:'DATE'}});fireEvent.change(screen.getByLabelText('题干'),{target:{value:'参与日期'}})
  expect(risk).toHaveBeenLastCalledWith({dirty:true,busy:false});expect(screen.getByRole('button',{name:'检查与试答'})).toBeDisabled()
  fireEvent.click(screen.getByRole('button',{name:'工具集'}));expect(screen.getByLabelText('题干')).toHaveValue('参与日期')
  fireEvent.click(screen.getByRole('button',{name:'添加题目'}));await waitFor(()=>expect(screen.getByRole('button',{name:'编辑题目：参与日期'})).toBeVisible())
  await waitFor(()=>expect(screen.getByLabelText('题干')).toHaveValue(''))
  const writes=vi.mocked(fetch).mock.calls.filter(([url,init])=>String(url).endsWith('/tool-library/'+tid)&&init?.method==='PATCH').map(([,init])=>JSON.parse(String(init?.body)))
  expect(writes).toHaveLength(2);expect(writes[1]).toMatchObject({revision:3,definition:{schemaVersion:2,pages:[{questions:[{prompt:'参与日期',type:'DATE'}]}]}})
  expect(risk).toHaveBeenLastCalledWith({dirty:false,busy:false})
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
  render(<SurveyApp/>);fireEvent.click(await screen.findByRole('button',{name:'编辑'}));await screen.findByRole('heading',{name:form.title});fireEvent.click(screen.getByRole('button',{name:'编辑名称'}));fireEvent.change(screen.getByLabelText('工具名称'),{target:{value:'独立工具未保存'}})
  const nav=screen.getByRole('navigation',{name:'研究工作台导航'})
  fireEvent.click(within(nav).getByRole('link',{name:'我的研究'}));expect(await screen.findByRole('heading',{name:'研究工作台'})).toBeVisible()
  fireEvent.click(within(nav).getByRole('link',{name:'工具集'}));expect(screen.getByLabelText('工具名称')).toHaveValue('独立工具未保存')
  expect(new URLSearchParams(window.location.search).get('tool')).toBe(tid)
  expect(screen.getByRole('heading',{name:'独立工具未保存'})).toBeVisible()
  expect(screen.getByRole('button',{name:'编辑名称'})).toHaveAttribute('aria-expanded','true')
  expect(screen.getByLabelText('工具名称')).toBeVisible()
  expect(screen.getByText('编制与使用说明').compareDocumentPosition(screen.getByRole('heading',{name:/题目编辑/}))).toBe(Node.DOCUMENT_POSITION_PRECEDING)
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
