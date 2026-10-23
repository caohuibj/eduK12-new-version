import {act,fireEvent,render,screen,waitFor,within} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {afterEach,describe,expect,it,vi} from 'vitest'
import SurveyResearchersAdmin from './SurveyResearchersAdmin'
import {SurveyCatalogGrants} from './SurveyCatalogGrants'

const root='/api/platform/survey'
const people=['ACTIVE','PENDING_MFA','SUSPENDED','REVOKED'].map((status,index)=>({id:'r'+index,username:'合成研究者'+index,status,createdAt:'2026-10-19T00:00:00Z'}))
const source={kind:'SCALE',sourceId:'source-exact',sourceVersion:'5'}
const grant={id:'g1',title:'既有量表',kind:'SCALE',status:'ACTIVE',sourceRef:source}
function mount({postError=false,refreshError=false,clipboardError=false,postPending,unavailable=false,postOutcome}:{postError?:boolean;refreshError?:boolean;clipboardError?:boolean;postPending?:Promise<unknown>;unavailable?:boolean;postOutcome?:'lost-response'|'non-json'|'server-error'|'missing-link'}={}){
  const original=window
  vi.stubGlobal('window',new Proxy(original,{get(target,key){return key==='location'?{origin:'http://localhost:5197'}:Reflect.get(target,key)}}))
  const writeText=clipboardError?vi.fn().mockRejectedValue(new Error('clipboard denied')):vi.fn().mockResolvedValue(undefined)
  Object.defineProperty(navigator,'clipboard',{value:{writeText},configurable:true})
  let wrote=false,committedPath=''
  const fetcher=vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{
    const path=String(input);let data:unknown,status=200
    if(path==='/api/auth/csrf')data={csrfToken:'synthetic-csrf'}
    else if(init?.method==='POST'){
      if(postPending)await postPending
      if(postOutcome){
        // Model an already-persisted operation with no trustworthy success ACK.
        wrote=true;committedPath=path
        if(postOutcome==='lost-response')throw new TypeError('synthetic connection lost after commit')
        if(postOutcome==='non-json')return new Response('<html>synthetic non-JSON response after commit</html>',{status:200,headers:{'Content-Type':'text/html'}})
        if(postOutcome==='missing-link')return {ok:true,status:200,json:async()=>({code:0,data:{id:'new-invite',kind:'INVITE'}})} as Response
        return {ok:false,status:500,json:async()=>({code:'ERROR',message:'synthetic server error',data:null})} as Response
      }
      if(postError){status=403;data=null}else{
        wrote=true;data=path===root+'/researcher-invitations'?{token:'synthetic-invite-only',kind:'INVITE'}:{id:'g1'}
      }
    }else if(path.startsWith(root+'/researchers?')){
      if(refreshError&&wrote)throw Error('synthetic list unavailable');data={list:postOutcome&&wrote&&committedPath.endsWith('/suspend')?people.map(p=>p.id==='r0'?{...p,status:'SUSPENDED'}:p):unavailable?[...people,{...people[0],id:'unavailable',username:'资格不可用的合成账户',status:'UNAVAILABLE'}]:people}
    }else if(path.startsWith(root+'/researcher-invitations?'))data={list:[
      {id:'pending-invite',kind:'INVITE',status:'PENDING',createdBy:'synthetic-admin',createdAt:'2026-10-19T00:00:00Z',expiresAt:'2026-10-26T00:00:00Z'},
      {id:'expired-invite',kind:'INVITE',status:'EXPIRED',createdBy:'synthetic-admin',createdAt:'2026-10-01T00:00:00Z',expiresAt:'2026-10-08T00:00:00Z'},
      ...(postOutcome&&wrote&&committedPath===root+'/researcher-invitations'?[{id:'unconfirmed-created-invite',kind:'INVITE',status:'PENDING',createdBy:'synthetic-admin',createdAt:'2026-10-19T01:00:00Z',expiresAt:'2026-10-26T01:00:00Z'}]:[]),
    ]}
    else if(path.includes('/source-catalog?'))data={list:[
      {title:'精确量表',ref:source,available:true},
      {title:'不兼容量表',ref:{...source,sourceVersion:'6'},available:false,unsupportedReason:'许可不允许'},
    ],page:1,hasMore:false,terminalReason:'END_OF_CATALOG'}
    else if(path.includes('/tool-grants?page='))data={list:[grant]}
    else throw Error('Unexpected route '+path)
    return {ok:status===200,status,json:async()=>({code:status===200?0:'FORBIDDEN',message:'当前管理员密码校验失败',data})} as Response
  })
  vi.stubGlobal('fetch',fetcher);render(<SurveyResearchersAdmin/>);return {fetcher,writeText}
}
const password=()=>screen.getByLabelText('当前管理员密码（敏感操作再次验证）')
const tab=(name:string)=>screen.getByRole('tab',{name:new RegExp('^'+name+' ')})
async function ready(){await screen.findByRole('heading',{name:'合成研究者0'});await waitFor(()=>expect(screen.getByRole('button',{name:'刷新管理列表'})).toBeEnabled())}
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals()})
describe('S05 administrator workspace',()=>{
  it('does not mistake a failed grant read for an empty authorization list',async()=>{
    const api=vi.fn().mockRejectedValue(new Error('授权列表读取失败'))
    render(<SurveyCatalogGrants api={api} password="" researchers={people}/>)
    fireEvent.change(screen.getByLabelText('授权给研究者'),{target:{value:'r0'}})
    expect(await screen.findByRole('alert')).toHaveTextContent('授权列表读取失败')
    expect(screen.queryByText('当前页暂无版本授权。')).toBeNull()
    expect(screen.getByLabelText('授权给研究者')).toHaveValue('r0')
    expect(api).toHaveBeenCalledExactlyOnceWith('/researchers/r0/tool-grants?page=1')
  })
  it('retains verification input, selected object and type while keyboard sections add no requests',async()=>{
    const user=userEvent.setup(),{fetcher}=mount();await ready()
    expect(document.querySelector('.survey-admin-security')).not.toHaveAttribute('open')
    expect(screen.queryByRole('button',{name:'邀请研究者'})).toBeNull()
    fireEvent.change(password(),{target:{value:'synthetic-password'}})
    fireEvent.click(tab('工具授权'))
    fireEvent.change(screen.getByLabelText('授权给研究者'),{target:{value:'r0'}})
    await screen.findByRole('heading',{name:'既有量表'})
    fireEvent.change(screen.getByLabelText('来源类型'),{target:{value:'FORM'}})
    const before=fetcher.mock.calls.length
    fireEvent.click(tab('研究者'));tab('研究者').focus();await user.keyboard('{ArrowRight}')
    expect(tab('邀请')).toHaveFocus();expect(tab('邀请')).toHaveAttribute('aria-selected','true')
    await user.keyboard('{End}');expect(tab('工具授权')).toHaveFocus()
    expect(password()).toHaveValue('synthetic-password')
    expect(screen.getByLabelText('授权给研究者')).toHaveValue('r0')
    expect(screen.getByLabelText('来源类型')).toHaveValue('FORM')
    expect(screen.getByRole('heading',{name:'既有量表'})).toBeInTheDocument()
    expect(fetcher.mock.calls).toHaveLength(before)
  })
  it('matches existing researcher status restrictions without granting access through controls',async()=>{
    mount({unavailable:true});await ready();fireEvent.change(password(),{target:{value:'synthetic-password'}})
    for(const n of [0,1])expect(screen.getByRole('button',{name:'重置 TOTP：合成研究者'+n})).toBeEnabled()
    for(const n of [2,3]){
      expect(screen.getByRole('button',{name:'重置 TOTP：合成研究者'+n})).toBeDisabled()
      expect(screen.getByRole('button',{name:'密码重置邀请：合成研究者'+n})).toBeDisabled()
    }
    expect(screen.getByRole('button',{name:'恢复资格：合成研究者2'})).toBeEnabled()
    expect(screen.queryByRole('button',{name:'恢复资格：合成研究者3'})).toBeNull()
    expect(screen.queryByRole('button',{name:'永久撤销资格：合成研究者3'})).toBeNull()
    expect(screen.getByRole('button',{name:'永久撤销资格：资格不可用的合成账户'})).toBeDisabled()
  })
  it('keeps in-flight verification and operation state across sections without additional requests',async()=>{
    let resolve!:()=>void
    const postPending=new Promise<void>(done=>{resolve=done})
    const {fetcher}=mount({postPending});await ready()
    fireEvent.change(password(),{target:{value:'synthetic-password'}});fireEvent.click(tab('邀请'))
    fireEvent.click(screen.getByRole('button',{name:'生成研究者邀请'}))
    await waitFor(()=>expect(fetcher.mock.calls.filter(([,init])=>init?.method==='POST')).toHaveLength(1))
    expect(password()).toBeDisabled();expect(screen.getByRole('button',{name:'生成研究者邀请'})).toBeDisabled()
    const before=fetcher.mock.calls.length
    fireEvent.click(tab('研究者'));expect(screen.getByRole('button',{name:'暂停资格：合成研究者0'})).toBeDisabled()
    fireEvent.click(tab('工具授权'));fireEvent.click(tab('邀请'))
    expect(password()).toHaveValue('synthetic-password');expect(fetcher.mock.calls).toHaveLength(before)
    await act(async()=>resolve())
    await waitFor(()=>expect(password()).toBeEnabled())
    expect(screen.getByRole('status')).toHaveTextContent('研究者开户邀请已签发')
    expect(fetcher.mock.calls.filter(([,init])=>init?.method==='POST')).toHaveLength(1)
  })
  it('identifies cancelled researcher and invitation actions without submitting writes',async()=>{
    const {fetcher}=mount();await ready();fireEvent.change(password(),{target:{value:'synthetic-password'}})
    const confirm=vi.spyOn(window,'confirm').mockReturnValue(false)
    fireEvent.click(screen.getByRole('button',{name:'永久撤销资格：合成研究者0'}))
    expect(confirm).toHaveBeenLastCalledWith(expect.stringContaining('合成研究者0'))
    expect(screen.getByRole('status')).toHaveTextContent('已取消永久撤销资格：合成研究者0')
    fireEvent.click(tab('邀请'))
    fireEvent.click(screen.getByRole('button',{name:'撤销未领取邀请：pending-invite'}))
    expect(screen.getByRole('status')).toHaveTextContent('已取消撤销邀请 pending-invite')
    expect(screen.queryByRole('button',{name:'撤销未领取邀请：expired-invite'})).toBeNull()
    expect(fetcher.mock.calls.some(([,init])=>init?.method==='POST')).toBe(false)
  })
  it('keeps a rejected operation recoverable and retains the entered verification value',async()=>{
    const {fetcher}=mount({postError:true});await ready();fireEvent.change(password(),{target:{value:'synthetic-password'}})
    fireEvent.click(tab('邀请'));fireEvent.click(screen.getByRole('button',{name:'生成研究者邀请'}))
    expect(await screen.findByRole('alert')).toHaveTextContent('操作已被拒绝：当前管理员密码校验失败')
    expect(password()).toHaveValue('synthetic-password')
    expect(screen.getByRole('button',{name:'生成研究者邀请'})).toBeEnabled()
    expect(fetcher.mock.calls.filter(([,init])=>init?.method==='POST')).toHaveLength(1)
    expect(screen.queryByRole('button',{name:'复制链接'})).toBeNull()
  })
  it.each(['lost-response','non-json','server-error','missing-link'] as const)('keeps invitation outcome unconfirmed after %s and checks state without resending',async(postOutcome)=>{
    const {fetcher}=mount({postOutcome});await ready();fireEvent.change(password(),{target:{value:'synthetic-password'}})
    fireEvent.click(tab('邀请'));fireEvent.click(screen.getByRole('button',{name:'生成研究者邀请'}))
    const feedback=await screen.findByRole('alert')
    expect(feedback).toHaveTextContent('操作结果未确认')
    expect(feedback).not.toHaveTextContent('操作未完成')
    expect(feedback).toHaveTextContent('刷新列表不能重新取得已丢失的链接')
    expect(screen.queryByRole('button',{name:'复制链接'})).toBeNull()
    expect(fetcher.mock.calls.filter(([,init])=>init?.method==='POST')).toHaveLength(1)
    fireEvent.click(screen.getByRole('button',{name:'核对当前列表与状态'}))
    await waitFor(()=>expect(screen.getByRole('button',{name:'核对当前列表与状态'})).toBeEnabled())
    expect(screen.getByRole('status')).toHaveTextContent('本次核对未重发操作')
    expect(screen.getByRole('alert')).toHaveTextContent('操作结果未确认')
    expect(screen.getByText(/邀请编号：unconfirmed-created-invite/)).toBeInTheDocument()
    expect(screen.queryByRole('button',{name:'复制链接'})).toBeNull()
    expect(fetcher.mock.calls.filter(([,init])=>init?.method==='POST')).toHaveLength(1)
    expect(fetcher.mock.calls.filter(([url])=>String(url).startsWith(root+'/researcher-invitations?'))).toHaveLength(2)
  })
  it('reconciles a possibly committed qualification change without asserting failure or resubmitting',async()=>{
    const {fetcher}=mount({postOutcome:'lost-response'});await ready();fireEvent.change(password(),{target:{value:'synthetic-password'}})
    fireEvent.click(screen.getByRole('button',{name:'暂停资格：合成研究者0'}))
    expect(await screen.findByRole('alert')).toHaveTextContent('暂停资格：合成研究者0：操作结果未确认')
    fireEvent.click(screen.getByRole('button',{name:'核对当前列表与状态'}))
    await waitFor(()=>expect(within(screen.getByRole('article',{name:'研究者：合成研究者0'})).getByText('已暂停')).toBeInTheDocument())
    expect(screen.getByRole('alert')).toHaveTextContent('操作结果未确认')
    expect(fetcher.mock.calls.filter(([,init])=>init?.method==='POST')).toHaveLength(1)
  })
  it('distinguishes acknowledged creation from a list-refresh failure and never repeats the write',async()=>{
    const {fetcher}=mount({refreshError:true});await ready();fireEvent.change(password(),{target:{value:'synthetic-password'}})
    fireEvent.click(tab('邀请'));fireEvent.click(screen.getByRole('button',{name:'生成研究者邀请'}))
    expect(await screen.findByRole('alert')).toHaveTextContent('操作已完成，但列表刷新失败')
    expect(screen.getByRole('status')).toHaveTextContent('研究者开户邀请已签发')
    expect(screen.getByRole('button',{name:'复制链接'})).toBeEnabled()
    fireEvent.click(screen.getByRole('button',{name:'刷新管理列表'}))
    await waitFor(()=>expect(screen.getByRole('button',{name:'刷新管理列表'})).toBeEnabled())
    expect(fetcher.mock.calls.filter(([,init])=>init?.method==='POST')).toHaveLength(1)
  })
  it('submits the displayed exact object/version and makes cancellation explicit',async()=>{
    const {fetcher}=mount();await ready();fireEvent.change(password(),{target:{value:'synthetic-password'}})
    fireEvent.click(tab('工具授权'));fireEvent.change(screen.getByLabelText('授权给研究者'),{target:{value:'r2'}})
    await screen.findByRole('heading',{name:'既有量表'})
    fireEvent.click(screen.getByRole('button',{name:'查询可授权版本'}));await screen.findByRole('heading',{name:'精确量表'})
    expect(screen.getByRole('button',{name:'授权此版本：精确量表 · 5 → 合成研究者2'})).toBeDisabled()
    fireEvent.change(screen.getByLabelText('授权给研究者'),{target:{value:'r0'}})
    await waitFor(()=>expect(screen.getByRole('button',{name:'授权此版本：精确量表 · 5 → 合成研究者0'})).toBeEnabled())
    expect(screen.getByRole('button',{name:'授权此版本：不兼容量表 · 6 → 合成研究者0'})).toBeDisabled()
    fireEvent.click(screen.getByRole('button',{name:'授权此版本：精确量表 · 5 → 合成研究者0'}))
    await screen.findByText(/已向 合成研究者0 授权 精确量表 · 版本 5/)
    const write=fetcher.mock.calls.find(([url,init])=>String(url)===root+'/researchers/r0/tool-grants'&&init?.method==='POST')!
    expect(JSON.parse(write[1]!.body as string)).toEqual({currentPassword:'synthetic-password',source})
    expect(write[1]?.credentials).toBe('same-origin');expect(write[1]?.headers).toMatchObject({'X-CSRF-Token':'synthetic-csrf'})
    vi.spyOn(window,'confirm').mockReturnValue(false)
    fireEvent.click(screen.getByRole('button',{name:'撤销版本授权：合成研究者0 · 既有量表 · 5'}))
    expect(screen.getByText(/已取消撤销 合成研究者0 的 既有量表 · 版本 5/)).toBeInTheDocument()
    expect(fetcher.mock.calls.filter(([,init])=>init?.method==='POST')).toHaveLength(1)
  })
  it('reports clipboard denial without retrying invitation creation',async()=>{
    const {fetcher}=mount({clipboardError:true});await ready();fireEvent.change(password(),{target:{value:'synthetic-password'}})
    fireEvent.click(tab('邀请'));fireEvent.click(screen.getByRole('button',{name:'生成研究者邀请'}))
    fireEvent.click(await screen.findByRole('button',{name:'复制链接'}))
    expect(await screen.findByRole('alert')).toHaveTextContent('未能写入剪贴板')
    expect(fetcher.mock.calls.filter(([,init])=>init?.method==='POST')).toHaveLength(1)
  })
})
