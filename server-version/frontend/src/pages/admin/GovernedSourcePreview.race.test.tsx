import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react'
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
import GovernedToolsWorkspace from './GovernedToolsWorkspace'
import {WavePackagePicker} from '../../survey/WavePackagePicker'
import {ResearchPackageCatalog} from '../../survey/ResearchPackageCatalog'
const {admin,research}=vi.hoisted(()=>({admin:vi.fn(),research:vi.fn()}))
vi.mock('../../api/surveyGovernance',async()=>({...await vi.importActual('../../api/surveyGovernance'),governedRequest:admin,governedResearcherRequest:research}))
vi.mock('../../admin/AdminStepUp',()=>({default:()=>null}))
const deferred=<T,>()=>{let resolve!:(value:T)=>void,reject!:(reason:Error)=>void;const promise=new Promise<T>((yes,no)=>{resolve=yes;reject=no});return {promise,resolve,reject}}
const sources=['A','B'].map((key,index)=>({ref:{kind:'COGNITIVE',sourceId:key,sourceVersion:String(index+1)},title:'来源'+key,available:true}))
const preview=(key:string)=>({source:{title:'来源'+key},metrics:[{metricKey:'metric'+key,unit:'score'}],parameters:[{id:'parameter'+key,key:'参数'+key,version:'1'}]})
beforeEach(()=>{admin.mockReset();research.mockReset();vi.spyOn(window,'confirm').mockReturnValue(true)})
afterEach(()=>{cleanup();vi.restoreAllMocks()})
describe('source previews are bound to exact source identity and request generation',()=>{
 it('ignores delayed A after selecting B and submits only B parameters and metrics',async()=>{
  const a=deferred<ReturnType<typeof preview>>()
  admin.mockImplementation(async(_scope:string,path:string)=>path.startsWith('/sources')?{list:sources,hasMore:true}:path.startsWith('/source-preview')?path.includes('sourceId=A')?a.promise:preview('B'):{list:[],hasMore:false})
  render(<GovernedToolsWorkspace/>);fireEvent.click(screen.getByText('提交新的认知测验版本',{exact:false}));fireEvent.click(screen.getByRole('button',{name:'读取可提交来源'}))
  await screen.findByRole('option',{name:/来源A/})
  fireEvent.change(screen.getByLabelText('原来源精确版本'),{target:{value:'0'}})
  await waitFor(()=>expect(admin.mock.calls.some(c=>c[1].includes('sourceId=A'))).toBe(true))
  expect(screen.getByLabelText('参数版本')).toBeDisabled();expect(screen.getByRole('button',{name:'保存为待审核版本'})).toBeDisabled()
  fireEvent.change(screen.getByLabelText('原来源精确版本'),{target:{value:'1'}})
  await screen.findByRole('option',{name:'参数B · 1'})
  await act(async()=>a.resolve(preview('A')))
  expect(screen.queryByRole('option',{name:'参数A · 1'})).toBeNull()
  fireEvent.change(screen.getByLabelText('参数版本'),{target:{value:'parameterB'}})
  fireEvent.change(screen.getByLabelText('报告'),{target:{value:'CONFIGURED'}})
  fireEvent.click(screen.getByLabelText('metricB · score'))
  fireEvent.click(screen.getByRole('button',{name:'保存为待审核版本'}))
  await waitFor(()=>expect(admin.mock.calls.find(c=>c[1]==='/submissions/source')?.[2]).toMatchObject({source:sources[1].ref,parameterReleaseId:'parameterB',report:{template:{blocks:[{metricKey:'metricB'}]}}}))
 })
 it.each(['search','family','page'] as const)('invalidates preview on %s changes, including stale failures',async change=>{
  const a=deferred<ReturnType<typeof preview>>()
  admin.mockImplementation(async(_scope:string,path:string)=>path.startsWith('/sources')?{list:sources,hasMore:true}:path.startsWith('/source-preview')?a.promise:{list:[],hasMore:true})
  render(<GovernedToolsWorkspace/>);fireEvent.click(screen.getByText('提交新的认知测验版本',{exact:false}));fireEvent.click(screen.getByRole('button',{name:'读取可提交来源'}));await screen.findByRole('option',{name:/来源A/})
  fireEvent.change(screen.getByLabelText('原来源精确版本'),{target:{value:'0'}})
  await waitFor(()=>expect(admin.mock.calls.some(c=>c[1].includes('sourceId=A'))).toBe(true))
  if(change==='search')fireEvent.change(screen.getByLabelText('搜索来源名称或标识'),{target:{value:'B'}})
  if(change==='family')fireEvent.click(screen.getByRole('button',{name:'表单'}))
  if(change==='page')fireEvent.click(screen.getByRole('button',{name:'下一页来源'}))
  await act(async()=>a.reject(new Error('stale A error')))
  expect(screen.queryByText('stale A error')).toBeNull();expect(screen.queryByRole('option',{name:'参数A · 1'})).toBeNull()
  expect(screen.getByRole('button',{name:'保存为待审核版本'})).toBeDisabled()
 })
})
it('ignores old WavePackagePicker errors and finally after a project switch',async()=>{
 const old=deferred<{list:unknown[];hasMore:boolean}>(),next=deferred<{list:unknown[];hasMore:boolean}>()
 research.mockImplementation((path:string)=>path.startsWith('/old/')?old.promise:next.promise)
 const props={selected:[],disabled:false,onSelect:vi.fn()}
 const view=render(<WavePackagePicker {...props} projectId="old"/>);fireEvent.click(screen.getByText('已导入组合：按整包选择投放'));fireEvent.click(screen.getByRole('button',{name:'读取已导入组合'}))
 view.rerender(<WavePackagePicker {...props} projectId="new"/>);fireEvent.click(screen.getByRole('button',{name:'读取已导入组合'}))
 await act(async()=>old.reject(new Error('stale project failure')))
 expect(screen.queryByRole('alert')).toBeNull();expect(screen.getByRole('button',{name:'读取已导入组合'})).toBeDisabled()
 await act(async()=>next.resolve({list:[],hasMore:false}));expect(screen.getByRole('button',{name:'读取已导入组合'})).toBeEnabled()
})
it('shows frozen package versions and prevents selection of an expired ACTIVE import',async()=>{
 research.mockResolvedValue({list:[{id:'instance',hash:'a'.repeat(64),title:'Expired exact package',family:'BUNDLE',status:'ACTIVE',expiresAt:'2026-01-01T00:00:00Z',versions:{content:'c1',parameters:null,report:'r1'},bindings:[{draftId:'a',slotKey:'a',instrumentKey:'a'}],availability:{ready:false,reasons:['整包授权已到期'],requiresFreshCheck:true}}],hasMore:false})
 render(<WavePackagePicker projectId="p" selected={[]} disabled={false} onSelect={vi.fn()}/>);fireEvent.click(screen.getByText('已导入组合：按整包选择投放'));fireEvent.click(screen.getByRole('button',{name:'读取已导入组合'}))
 await screen.findByText('整包授权已到期');expect(screen.getByText(/内容 c1 · 参数 未配置 · 报告 r1/)).toBeInTheDocument();expect(screen.getByRole('button',{name:'完整加入当前问卷'})).toBeDisabled()
})
it('does not create a second package import when only the acknowledged handoff refresh failed',async()=>{
 const grant={id:'grant',hash:'a'.repeat(64),title:'Synthetic',family:'BUNDLE',status:'ACTIVE',versions:{content:'1',parameters:null,report:'1'},availability:{ready:true,reasons:[]}}
 const bindings=[{draftId:'a',slotKey:'a',instrumentKey:'a'}],handoff=vi.fn().mockRejectedValueOnce(new Error('list refresh failed')).mockResolvedValue(undefined)
 research.mockImplementation(async(path:string)=>path.endsWith('/import')?{bindings}:{list:[grant],hasMore:false})
 render(<ResearchPackageCatalog projectId="p" busy={false} onImported={handoff}/>);fireEvent.click(screen.getByRole('button',{name:'查看我的整包授权'}));await screen.findByText('Synthetic')
 fireEvent.click(screen.getByRole('button',{name:'整包导入：Synthetic'}));await screen.findByText(/整包已保存，重试只刷新导入交接/)
 fireEvent.click(screen.getByRole('button',{name:'整包导入：Synthetic'}));await screen.findByText(/整包已加入本研究/)
 expect(research.mock.calls.filter(c=>c[0].endsWith('/import'))).toHaveLength(1);expect(handoff).toHaveBeenCalledTimes(2)
})
