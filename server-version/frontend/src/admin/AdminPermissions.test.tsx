import {beforeEach,expect,it,vi} from 'vitest'
import {fireEvent,render,screen,waitFor} from '@testing-library/react'
import {MemoryRouter} from 'react-router-dom'
import AdminPermissions from './AdminPermissions'
const client=vi.hoisted(()=>({get:vi.fn(),put:vi.fn()}))
vi.mock('../api/client',()=>({default:client}))
vi.mock('../contexts/AuthContext',()=>({useAuth:()=>({user:{id:'system',username:'system_admin',platformRole:'SYSTEM_ADMIN'}})}))
vi.mock('./AdminStepUp',()=>({default:()=> <p>独立身份验证</p>}))
const renderPermissions=(path='/admin/permissions')=>render(<MemoryRouter initialEntries={[path]}><AdminPermissions/></MemoryRouter>)
const accounts={data:{accounts:[{id:'survey',username:'survey_manager',platformRole:'STANDARD',entries:[{entry:'SURVEY',active:true,version:7}]}]}}
beforeEach(()=>{
 vi.clearAllMocks();sessionStorage.clear();vi.spyOn(window,'confirm').mockReturnValue(false)
 client.get.mockResolvedValue(accounts)
 client.put.mockResolvedValue({})
})
it('opens the governed tool’s exact catalog and license records without selecting or issuing a tool',async()=>{
 const key='FORM:survey-draft:synthetic&view=content#fragment/题本'
 const accountResponse={data:{accounts:[]}}
 client.get.mockImplementation(async (path:string)=>{
  if(path.includes('/accounts?'))return accountResponse
  const query=new URL(path,'http://localhost').searchParams
  if(path.includes('/tools?')&&query.get('key')===key)
    return {data:{list:[{key,name:'合成表单',family:'FORM'}],hasMore:false}}
  return {data:{list:[],hasMore:false,enforcedProducts:['SURVEY'],pilotToolFamilies:{SURVEY:['FORM','COGNITIVE']}}}
 })
 const anchor='/admin/permissions?'+new URLSearchParams({view:'tools',product:'SURVEY',toolKey:key})
 renderPermissions(anchor)
 expect(screen.getByRole('combobox',{name:'产品入口'})).toHaveValue('SURVEY')
 expect(await screen.findByRole('checkbox',{name:/合成表单/})).not.toBeChecked()
 expect(await screen.findByText(/覆盖表单、认知测评/)).toBeVisible()
 expect(client.get).toHaveBeenCalledWith('/admin/permissions/tool-licenses?'+new URLSearchParams({product:'SURVEY',page:'1',toolKey:key}))
 fireEvent.click(screen.getByRole('button',{name:'查看全部工具许可'}))
 await waitFor(()=>expect(client.get).toHaveBeenCalledWith('/admin/permissions/tool-licenses?product=SURVEY&page=1'))
 expect(client.put).not.toHaveBeenCalled()
})
it('requires an impact review and a reason before sending the planned versioned grant change',async()=>{
 const path='/admin/permissions/accounts/survey/entries/SURVEY'
 const digest='a'.repeat(64)
 client.get.mockImplementation(async (url:string)=>url===path+'/offboarding'
  ? {data:{version:7,digest,counts:{collecting:0,drafts:0,configurations:0,pending:0},items:[],successors:[]}}
  : accounts)
 renderPermissions()
 const name=await screen.findByText('survey_manager',{selector:'strong'})
 expect(screen.getByRole('button',{name:'撤销 survey_manager SURVEY'})).not.toBeVisible()
 fireEvent.click(name.closest('summary')!)
 fireEvent.click(screen.getByRole('button',{name:'撤销 survey_manager SURVEY'}))
 expect(await screen.findByText(/待处理 0 项/)).toBeVisible()
 const confirm=screen.getByRole('button',{name:'确认交接并撤权'})
 expect(confirm).toBeDisabled()
 expect(client.get).toHaveBeenCalledWith(path+'/offboarding')
 expect(client.put).not.toHaveBeenCalled()
 fireEvent.change(screen.getByLabelText('撤权原因'),{target:{value:'精确资格复核'}})
 fireEvent.click(confirm)
 await waitFor(()=>expect(client.put).toHaveBeenCalledWith(path,{active:false,expectedVersion:7,reason:'精确资格复核',offboarding:{mode:'PLANNED',digest}}))
 expect(client.put).toHaveBeenCalledTimes(1)
 await screen.findByText('入口权限已撤销，原会话已失效。')
})
it('retains a content draft when switching local views and never issues it implicitly',async()=>{
 renderPermissions();await screen.findByText('survey_manager',{selector:'strong'})
 fireEvent.click(screen.getByRole('button',{name:'精确内容授权'}))
 fireEvent.click(screen.getByText('编制精确内容授权',{selector:'summary'}))
 fireEvent.change(screen.getByLabelText('目标研究者 UUID'),{target:{value:'00000000-0000-4000-8000-000000000001'}})
 fireEvent.click(screen.getByRole('button',{name:'入口管理员'}))
 fireEvent.click(screen.getByRole('button',{name:'精确内容授权'}))
 expect(screen.getByLabelText('目标研究者 UUID')).toHaveValue('00000000-0000-4000-8000-000000000001')
 expect(client.put).not.toHaveBeenCalled();expect(client.get).toHaveBeenCalledTimes(1)
})
it('keeps audit rows bound to the latest selected account when responses finish out of order',async()=>{
 let finishFirst!:(value:unknown)=>void
 const first=new Promise(resolve=>{finishFirst=resolve})
 const accounts=['first','second'].map(id=>({id,username:id+'_manager',platformRole:'STANDARD',entries:[]}))
 client.get.mockImplementation((url:string)=>url.includes('/accounts?')?Promise.resolve({data:{accounts}}):url.endsWith('first')?first:Promise.resolve({data:[{id:'second-audit',action:'SECOND_ACCOUNT',entry:'TRAINING',reason:'Second account reason',createdAt:'2026-11-26T00:00:00Z'}]}))
 renderPermissions();await screen.findByText('first_manager',{selector:'strong'})
 fireEvent.click(screen.getByText('first_manager',{selector:'strong'}).closest('summary')!)
 fireEvent.click(screen.getByRole('button',{name:'查看 first_manager 审计'}))
 expect(screen.getByRole('status')).toHaveTextContent('正在读取 first_manager 的审计记录')
 expect(screen.queryByText('该账号暂无可见审计记录。')).not.toBeInTheDocument()
 fireEvent.click(screen.getByText('second_manager',{selector:'strong'}).closest('summary')!)
 fireEvent.click(screen.getByRole('button',{name:'查看 second_manager 审计'}))
 await screen.findByText('Second account reason')
 finishFirst({data:[{id:'first-audit',action:'FIRST_ACCOUNT',entry:'SURVEY',reason:'First account reason',createdAt:'2026-11-26T00:00:00Z'}]})
 await waitFor(()=>expect(screen.queryByText(/正在读取/)).not.toBeInTheDocument())
 expect(screen.getByText('Second account reason')).toBeVisible()
 expect(screen.queryByText('First account reason')).not.toBeInTheDocument()
 expect(screen.getByText(/最近授权审计/)).toHaveTextContent('second_manager')
})
it('does not apply an earlier audit failure to a newer account selection',async()=>{
 let rejectFirst!:(error:Error)=>void
 const first=new Promise((_,reject)=>{rejectFirst=reject})
 client.get.mockImplementation((url:string)=>url.includes('/accounts?')?Promise.resolve({data:{accounts:['first','second'].map(id=>({id,username:id+'_manager',platformRole:'STANDARD',entries:[]}))}}):url.endsWith('first')?first:Promise.resolve({data:[]}))
 renderPermissions();await screen.findByText('first_manager',{selector:'strong'})
 for(const id of ['first','second']){fireEvent.click(screen.getByText(id+'_manager',{selector:'strong'}).closest('summary')!);fireEvent.click(screen.getByRole('button',{name:'查看 '+id+'_manager 审计'}))}
 await screen.findByText('该账号暂无可见审计记录。')
 rejectFirst(new Error('Earlier account unavailable'))
 await waitFor(()=>expect(screen.queryByRole('status')).not.toBeInTheDocument())
 expect(screen.queryByText('Earlier account unavailable')).not.toBeInTheDocument()
 expect(screen.getByText(/最近授权审计/)).toHaveTextContent('second_manager')
})
it('loads tool licensing only when its view is selected and retains the existing verification panel',async()=>{
 const accounts={accounts:[{id:'survey',username:'survey_manager',platformRole:'STANDARD',entries:[]}]}
 client.get.mockImplementation(async(path:string)=>({data:path.includes('/tool-licenses')?{list:[],hasMore:false,enforcedProducts:[]}:accounts}))
 renderPermissions();await screen.findByText('survey_manager',{selector:'strong'})
 expect(client.get.mock.calls.some(([path])=>path.includes('/tool-licenses'))).toBe(false)
 fireEvent.click(screen.getByRole('button',{name:'工具授权'}))
 expect(await screen.findByRole('region',{name:'工具授权工作台'})).toBeVisible()
 await waitFor(()=>expect(client.get.mock.calls.filter(([path])=>path.includes('/tool-licenses'))).toHaveLength(3))
 expect(screen.getByText('独立身份验证')).toBeInTheDocument()
 expect(client.put).not.toHaveBeenCalled()
})
