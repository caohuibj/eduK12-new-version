import {act,fireEvent,render,screen,waitFor,within} from '@testing-library/react'
import {beforeEach,describe,expect,it,vi} from 'vitest'
import TrainingStandardConfigurationGrants, {TrainingStandardConfigurationWorkspace} from './TrainingStandardConfigurationGrants'
const auth=vi.hoisted(()=>({user:null as {id:string}|null}))
vi.mock('../contexts/AuthContext',()=>({useAuth:()=>auth}))
const api=vi.hoisted(()=>({catalog:vi.fn(),grants:vi.fn(),issue:vi.fn(),revoke:vi.fn(),operation:vi.fn()}))
const materials=vi.hoisted(()=>({listTeachers:vi.fn(),set:vi.fn()}))
vi.mock('../api/standardConfigurationGrants',async()=>({...await vi.importActual<typeof import('../api/standardConfigurationGrants')>('../api/standardConfigurationGrants'),standardConfigurationGrantsApi:api}))
vi.mock('../api/materialGrants',async()=>({...await vi.importActual<typeof import('../api/materialGrants')>('../api/materialGrants'),materialGrantApi:materials}))
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
const choice={id:id(1),title:'已有合法量表',toolKey:'existing',instrumentVersion:'1',combinationHash:'a'.repeat(64),state:'ONLINE',
 versions:{CONTENT:'1',PARAMETERS:'none-v1',REPORT:'short-reviewed'},assignable:true,unavailableReason:null}
const person={id:id(2),username:'trainer-one',nickname:'培训师甲',role:'TEACHER',teacherApproved:true,isActive:true,isFrozen:false}
const person2={...person,id:id(3),username:'trainer-two',nickname:'培训师乙'}
const grant={id:id(4),userId:person.id,username:person.username,nickname:person.nickname,issuerId:id(5),version:2,revokedAt:null,combinationHash:choice.combinationHash,canManage:true}

const key='training-exact-standard-issue:'+id(5)
const pending=()=>JSON.parse(sessionStorage.getItem(key)!)
const ack=(input:any)=>({code:0,data:{id:input.expectedUseId??input.requestId,userId:input.userId,combination:{releaseId:choice.id,combinationHash:choice.combinationHash},version:input.expectedUseVersion===undefined?1:input.expectedUseVersion+1,currentVersion:input.expectedUseVersion===undefined?1:input.expectedUseVersion+1,revoked:false}})
const operation=(p:any)=>({legacy:false,grant:{id:p.expectedUseId??p.requestId,version:p.expectedUseVersion===undefined?1:p.expectedUseVersion+1,currentVersion:p.expectedUseVersion===undefined?1:p.expectedUseVersion+1,revoked:false},request:{...p,actorId:id(5),grantId:null,expectedGrantVersion:null,expectedUseVersion:p.expectedUseVersion??null,title:undefined}})
const noGrant={code:0,data:{page:1,hasMore:false,list:[]}}
beforeEach(()=>{
 sessionStorage.clear(); vi.resetAllMocks();auth.user=null
 api.catalog.mockResolvedValue({code:0,data:{page:1,hasMore:false,list:[choice]}})
 materials.listTeachers.mockResolvedValue({code:0,data:{list:[person,person2],total:2}})
 api.grants.mockResolvedValue(noGrant);api.issue.mockImplementation(async(_choice,input)=>ack(input))
 api.operation.mockResolvedValue({code:0,data:{operation:null}})
 api.revoke.mockResolvedValue({code:0,data:{id:grant.id,version:3,revoked:true}})
})
async function open(){render(<TrainingStandardConfigurationWorkspace actorId={id(5)}/>);fireEvent.click(await screen.findByRole('button',{name:'管理此配置授权'}));return screen.findByRole('dialog',{name:'分配固定量表配置'})}
async function target(dialog:HTMLElement,who=person){await within(dialog).findByRole('option',{name:who.nickname+'（'+who.username+'）'});fireEvent.change(within(dialog).getByRole('combobox',{name:'接收培训师'}),{target:{value:who.id}});await waitFor(()=>expect(within(dialog).getByRole('combobox',{name:'接收培训师'})).toHaveValue(who.id));await act(async()=>{});fireEvent.change(within(dialog).getByRole('textbox',{name:'授权配置名称'}),{target:{value:'基础教学反馈'}})}
describe('Training administrator exact combination distribution',()=>{
 it('sends the selected combination identity through the dedicated issuer API and never the legacy SCALE writer',async()=>{
  const dialog=await open();expect(within(dialog).getByText('未配置阈值或常模')).toBeVisible()
  await target(dialog);await waitFor(()=>expect(within(dialog).getByRole('button',{name:'授权此配置'})).toBeEnabled())
  fireEvent.click(within(dialog).getByRole('button',{name:'授权此配置'}))
  await waitFor(()=>expect(api.issue).toHaveBeenCalledExactlyOnceWith({id:choice.id,combinationHash:choice.combinationHash},{requestId:expect.any(String),userId:person.id,configurationName:'基础教学反馈'}))
  expect(materials.set).not.toHaveBeenCalled()
 })
 it('does not let a late read for another recipient populate or authorize the current selection',async()=>{
  let finish!:(v:unknown)=>void;api.grants.mockImplementation((_id,q)=>q.userId===person.id?new Promise(resolve=>{finish=resolve}):Promise.resolve(noGrant))
  const dialog=await open();await target(dialog);await target(dialog,person2)
  await within(dialog).findByText('尚未分配此固定配置')
  await act(async()=>finish({code:0,data:{page:1,hasMore:false,list:[grant]}}))
  expect(within(dialog).queryByText('该培训师已有此固定配置的使用权')).not.toBeInTheDocument()
  fireEvent.click(within(dialog).getByRole('button',{name:'授权此配置'}))
  await waitFor(()=>expect(api.issue).toHaveBeenCalledWith({id:choice.id,combinationHash:choice.combinationHash},expect.objectContaining({userId:person2.id})))
 })
 it('blocks a second mutation after an uncertain outcome until the full original intent is read back',async()=>{
  api.issue.mockRejectedValueOnce(Error('连接中断'))
  const dialog=await open();await target(dialog);await waitFor(()=>expect(within(dialog).getByRole('button',{name:'授权此配置'})).toBeEnabled())
  fireEvent.click(within(dialog).getByRole('button',{name:'授权此配置'}));await within(dialog).findByRole('alert')
  expect(within(dialog).getByRole('button',{name:'授权此配置'})).toBeDisabled();expect(api.issue).toHaveBeenCalledTimes(1)
  api.grants.mockResolvedValue({code:0,data:{page:1,hasMore:false,list:[grant]}})
  fireEvent.click(within(dialog).getByRole('button',{name:'回读当前授权状态'}))
  await within(dialog).findByText('该培训师已有此固定配置的使用权')
  expect(api.issue).toHaveBeenCalledTimes(1);expect(screen.getByRole('button',{name:'核对原固定配置请求'})).toBeEnabled()
  expect(sessionStorage.getItem(key)).not.toBeNull()
 })
 it('keeps another issuer grant visible without exposing overwrite or revoke actions',async()=>{
  api.grants.mockResolvedValue({code:0,data:{page:1,hasMore:false,list:[{...grant,canManage:false}]}})
  const dialog=await open();await target(dialog);await within(dialog).findByText('此项由另一发行身份维护；不能覆盖或接管。')
  expect(within(dialog).getByRole('button',{name:'授权此配置'})).toBeDisabled()
  expect(within(dialog).queryByRole('button',{name:'撤销此配置使用权'})).not.toBeInTheDocument()
 })
 it('allows readback and versioned revocation after withdrawal while refusing new assignment',async()=>{
  api.catalog.mockResolvedValue({code:0,data:{page:1,hasMore:false,list:[{...choice,assignable:false,state:'WITHDRAWN',unavailableReason:'已停用'}]}})
  api.grants.mockResolvedValue({code:0,data:{page:1,hasMore:false,list:[grant]}})
  const dialog=await open();await target(dialog);fireEvent.click(await within(dialog).findByRole('button',{name:'撤销此配置使用权'}))
  await waitFor(()=>expect(api.revoke).toHaveBeenCalledWith(grant,expect.any(String)))
  expect(api.issue).not.toHaveBeenCalled()
 })
 it('refuses incomplete or cross-configuration readback instead of writing against an empty grant list',async()=>{
  api.grants.mockResolvedValue({code:0,data:{page:1,hasMore:false,list:[{...grant,combinationHash:'b'.repeat(64)}]}})
  const dialog=await open();await target(dialog);await within(dialog).findByRole('alert')
  expect(within(dialog).getByRole('button',{name:'授权此配置'})).toBeDisabled();expect(api.issue).not.toHaveBeenCalled()
 })
})

describe('Training exact issuance durable original-intent recovery',()=>{
 async function unknown(){api.issue.mockRejectedValueOnce(Error('response lost'));const dialog=await open();await target(dialog);await waitFor(()=>expect(within(dialog).getByRole('button',{name:'授权此配置'})).toBeEnabled());fireEvent.click(within(dialog).getByRole('button',{name:'授权此配置'}));await screen.findByRole('button',{name:'核对原固定配置请求'});await waitFor(()=>expect(within(dialog).getAllByRole('button',{name:'关闭'})[0]).toBeEnabled());return dialog}
 it('recovers the original recipient, label and revision after closing the dialog and never substitutes current grants',async()=>{
  const dialog=await unknown(),original=pending();fireEvent.click(within(dialog).getAllByRole('button',{name:'关闭'})[0])
  api.operation.mockResolvedValue({code:0,data:{operation:operation(original)}})
  fireEvent.click(screen.getByRole('button',{name:'核对原固定配置请求'}))
  await screen.findByText('原固定配置请求已确认保存。');expect(sessionStorage.getItem(key)).toBeNull();expect(api.issue).toHaveBeenCalledOnce()
 })
 it('retries only after verified absence and with the complete same original body',async()=>{
  await unknown();const original=api.issue.mock.calls[0]
  expect(screen.queryByRole('button',{name:'按原固定配置请求重试'})).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button',{name:'核对原固定配置请求'}))
  fireEvent.click(await screen.findByRole('button',{name:'按原固定配置请求重试'}))
  await screen.findByText('原固定配置请求已确认保存。');expect(api.issue.mock.calls).toEqual([original,original]);expect(sessionStorage.getItem(key)).toBeNull()
 })
 it('keeps the original unknown outcome when its retry is now refused',async()=>{
  await unknown();api.issue.mockRejectedValueOnce(Object.assign(Error('authority changed'),{status:403}))
  fireEvent.click(screen.getByRole('button',{name:'核对原固定配置请求'}));fireEvent.click(await screen.findByRole('button',{name:'按原固定配置请求重试'}))
  await screen.findByText('authority changed');expect(sessionStorage.getItem(key)).not.toBeNull();expect(api.issue).toHaveBeenCalledTimes(2)
 })
 it.each(['userId','configurationName','actorId','expectedUseVersion'])('does not clear a mismatching original %s',async(field)=>{
  await unknown();const found=operation(pending());found.request={...found.request,[field]:field==='expectedUseVersion'?99:field==='configurationName'?'另一用途':id(9)}
  api.operation.mockResolvedValue({code:0,data:{operation:found}});fireEvent.click(screen.getByRole('button',{name:'核对原固定配置请求'}))
  await screen.findByText(/原请求的接收者、配置/);expect(sessionStorage.getItem(key)).not.toBeNull();expect(api.issue).toHaveBeenCalledOnce();expect(screen.queryByRole('button',{name:'按原固定配置请求重试'})).not.toBeInTheDocument()
 })
 it('restores a prior revoked grant identity and reports its subsequently superseded operation as historical',async()=>{
  const saved={requestId:id(6),combinationId:choice.id,combinationHash:choice.combinationHash,userId:person.id,configurationName:'先前用途',title:choice.title,expectedUseId:grant.id,expectedUseVersion:2}
  sessionStorage.setItem(key,JSON.stringify(saved));const found=operation(saved);found.grant.currentVersion=5;found.grant.revoked=true
  api.operation.mockResolvedValue({code:0,data:{operation:found}});render(<TrainingStandardConfigurationWorkspace actorId={id(5)}/>);fireEvent.click(await screen.findByRole('button',{name:'核对原固定配置请求'}))
  await screen.findByText('原固定配置请求已保存；该修订目前已撤销或已有后续修订。');expect(sessionStorage.getItem(key)).toBeNull();expect(api.issue).not.toHaveBeenCalled()
 })
 it('keeps malformed absence and legacy results unresolved',async()=>{
  await unknown();api.operation.mockResolvedValueOnce({code:0,data:{}});fireEvent.click(screen.getByRole('button',{name:'核对原固定配置请求'}));await screen.findByText('原请求回读格式不完整。')
  api.operation.mockResolvedValueOnce({code:0,data:{operation:{...operation(pending()),legacy:true,request:null}}});fireEvent.click(screen.getByRole('button',{name:'核对原固定配置请求'}));await screen.findByText(/原请求的接收者、配置/)
  expect(sessionStorage.getItem(key)).not.toBeNull();expect(screen.queryByRole('button',{name:'按原固定配置请求重试'})).not.toBeInTheDocument()
 })
 it('scopes restored state and late responses to the current live account and hides the workspace on logout',async()=>{
  auth.user={id:id(5)};api.issue.mockRejectedValueOnce(Error('response lost'));const view=render(<TrainingStandardConfigurationGrants/>)
  fireEvent.click(await screen.findByRole('button',{name:'管理此配置授权'}));const dialog=await screen.findByRole('dialog');await target(dialog);await waitFor(()=>expect(within(dialog).getByRole('button',{name:'授权此配置'})).toBeEnabled());fireEvent.click(within(dialog).getByRole('button',{name:'授权此配置'}));await screen.findByRole('button',{name:'核对原固定配置请求'})
  let finish!:(v:unknown)=>void;api.operation.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve}));const original=pending();fireEvent.click(screen.getByRole('button',{name:'核对原固定配置请求'}))
  auth.user={id:id(9)};view.rerender(<TrainingStandardConfigurationGrants/>);await screen.findByRole('button',{name:'管理此配置授权'});await act(async()=>finish({code:0,data:{operation:operation(original)}}))
  expect(screen.queryByRole('button',{name:'核对原固定配置请求'})).not.toBeInTheDocument();expect(sessionStorage.getItem(key)).not.toBeNull();expect(screen.queryByText('原固定配置请求已确认保存。')).not.toBeInTheDocument()
  auth.user=null;view.rerender(<TrainingStandardConfigurationGrants/>);expect(screen.queryByRole('region',{name:'固定量表配置授权'})).not.toBeInTheDocument()
 })
})
