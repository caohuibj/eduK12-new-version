import {act,fireEvent,render,screen,waitFor} from '@testing-library/react'
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
import {SurveyResearchersWorkspace as SurveyResearchersAdmin} from './SurveyResearchersAdmin'
const {reauth}=vi.hoisted(()=>({reauth:vi.fn()}))
vi.mock('../../admin/securityKey',()=>({reauthenticateAdmin:reauth}))
const root='/api/platform/survey'
function mount(expireFirst=false){
  const original=window
  vi.stubGlobal('window',new Proxy(original,{get(target,key){return key==='location'?{origin:'http://localhost:5197'}:Reflect.get(target,key)}}))
  let writes=0
  const fetcher=vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{
    const path=String(input);let data:unknown
    if(path==='/api/auth/csrf')data={csrfToken:'synthetic-csrf'}
    else if(init?.method==='POST'){
      writes++
      if(expireFirst&&writes===1)return {ok:false,status:403,json:async()=>({code:'ADMIN_KEY_STEP_UP_REQUIRED',message:'敏感操作需要重新完成管理员双因素验证'})} as Response
      data={token:'synthetic-once-only',kind:'INVITE'}
    }else if(path.startsWith(root+'/researchers?'))data={list:[{id:'r1',username:'验证测试研究者',status:'ACTIVE',createdAt:'2026-10-23T00:00:00Z'}]}
    else if(path.startsWith(root+'/researcher-invitations?')||path.includes('/tool-grants?'))data={list:[]}
    else if(path.startsWith(root+'/source-catalog?'))data={list:[{title:'验证测试量表',ref:{kind:'SCALE',sourceId:'s1',sourceVersion:'3'},available:true}],page:1,hasMore:false,terminalReason:'END_OF_CATALOG'}
    else throw Error('Unexpected API '+path)
    return {ok:true,status:200,json:async()=>({code:0,data})} as Response
  })
  vi.stubGlobal('fetch',fetcher);render(<SurveyResearchersAdmin/>);return {fetcher,writes:()=>writes}
}
const password=()=>screen.getByLabelText('当前管理员密码（敏感操作再次验证）')
const invite=()=>screen.getByRole('button',{name:'生成研究者邀请'})
async function ready(){await screen.findByRole('heading',{name:'验证测试研究者'});fireEvent.click(screen.getByRole('tab',{name:/^邀请 /}))}
async function verify(){
  fireEvent.change(screen.getByLabelText('Authenticator 六位动态码'),{target:{value:'123456'}})
  fireEvent.click(screen.getByRole('button',{name:'重新验证管理员身份'}))
  await screen.findByText(/双因素验证已完成，有效期五分钟/)
}
beforeEach(()=>{reauth.mockReset().mockResolvedValue({code:0})})
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals()})
describe('Survey contextual operation verification',()=>{
  it('explains the protection and duration, then verifies without automatically issuing an invitation',async()=>{
    let resolve!:(value:unknown)=>void
    reauth.mockReturnValue(new Promise(done=>{resolve=done}))
    const state=mount();await ready()
    expect(screen.queryByRole('button',{name:'邀请研究者'})).toBeNull()
    const summary=document.querySelector('.survey-admin-security > summary')!
    expect(summary).toHaveAttribute('aria-describedby',document.querySelector('[role=tooltip]')!.id)
    expect(document.querySelector('[role=tooltip]')).toHaveTextContent('哪些操作需要？')
    expect(invite()).toBeEnabled();fireEvent.click(invite())
    expect(screen.getByRole('note')).toHaveTextContent('研究者开户邀请需要操作验证，尚未提交')
    expect(screen.getByRole('note')).toHaveTextContent('有效期为五分钟，不随操作延长')
    expect(password()).toHaveFocus();expect(state.writes()).toBe(0)
    fireEvent.change(password(),{target:{value:'synthetic-password'}})
    fireEvent.change(screen.getByLabelText('Authenticator 六位动态码'),{target:{value:'123456'}})
    fireEvent.click(screen.getByRole('button',{name:'重新验证管理员身份'}))
    expect(state.writes()).toBe(0);expect(screen.getByRole('button',{name:'正在验证…'})).toBeDisabled()
    await act(async()=>resolve({code:0}))
    expect(screen.getByText(/双因素验证已完成，有效期五分钟/)).toBeInTheDocument()
    expect(document.querySelector('.survey-admin-security')).not.toHaveAttribute('open')
    expect(summary).toHaveTextContent(/4:5\d 内有效/);expect(state.writes()).toBe(0)
    fireEvent.click(invite())
    await screen.findByText('http://survey.localhost:5197/claim#token=synthetic-once-only')
    expect(state.writes()).toBe(1)
  })
  it('blocks a locally expired proof even before the next countdown tick and never replays the write',async()=>{
    const state=mount();await ready();fireEvent.click(invite())
    fireEvent.change(password(),{target:{value:'synthetic-password'}});await verify()
    vi.spyOn(Date,'now').mockReturnValue(Date.now()+301000)
    fireEvent.click(invite())
    expect(screen.getByRole('note')).toHaveTextContent('双因素验证已到期')
    expect(document.querySelector('.survey-admin-security > summary')).toHaveTextContent('验证已到期')
    expect(screen.getByLabelText('Authenticator 六位动态码')).toHaveFocus()
    expect(state.writes()).toBe(0)
  })
  it('honors a server expiry rejection when the login proof age is unknown, then waits for a new explicit action',async()=>{
    const state=mount(true);await ready();fireEvent.change(password(),{target:{value:'synthetic-password'}})
    fireEvent.click(invite())
    await screen.findByRole('alert')
    expect(screen.getByRole('note')).toHaveTextContent('双因素验证已到期')
    expect(screen.getByLabelText('Authenticator 六位动态码')).toHaveFocus()
    expect(state.writes()).toBe(1)
    await verify();expect(state.writes()).toBe(1)
    fireEvent.click(invite());await screen.findByText('http://survey.localhost:5197/claim#token=synthetic-once-only')
    expect(state.writes()).toBe(2)
  })
  it('does not mark a rejected reauthentication as valid or issue the pending operation',async()=>{
    reauth.mockRejectedValue(new Error('合成动态码已过期'))
    const state=mount();await ready();fireEvent.click(invite())
    fireEvent.change(password(),{target:{value:'synthetic-password'}})
    fireEvent.change(screen.getByLabelText('Authenticator 六位动态码'),{target:{value:'123456'}})
    fireEvent.click(screen.getByRole('button',{name:'重新验证管理员身份'}))
    await screen.findByText('合成动态码已过期')
    expect(document.querySelector('.survey-admin-security > summary')).not.toHaveTextContent('内有效')
    expect(screen.getByLabelText('Authenticator 六位动态码')).toHaveValue('')
    expect(state.writes()).toBe(0)
  })
  it('uses the same prompt for exact-version tool grants without writing or changing the selected object',async()=>{
    const state=mount();await ready();fireEvent.click(screen.getByRole('tab',{name:/^工具授权 /}))
    fireEvent.change(screen.getByLabelText('授权给研究者'),{target:{value:'r1'}})
    await waitFor(()=>expect(screen.getByRole('button',{name:'查询可授权版本'})).toBeEnabled())
    fireEvent.click(screen.getByRole('button',{name:'查询可授权版本'}));await screen.findByRole('heading',{name:'验证测试量表'})
    fireEvent.click(screen.getByRole('button',{name:'授权此版本：验证测试量表 · 3 → 验证测试研究者'}))
    expect(screen.getByRole('note')).toHaveTextContent('授权 验证测试量表 · 版本 3 给 验证测试研究者需要操作验证')
    expect(password()).toHaveFocus();expect(screen.getByLabelText('授权给研究者')).toHaveValue('r1');expect(state.writes()).toBe(0)
  })
})
