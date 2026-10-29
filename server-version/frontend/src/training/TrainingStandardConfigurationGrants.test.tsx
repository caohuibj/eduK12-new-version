import {act,fireEvent,render,screen,waitFor,within} from '@testing-library/react'
import {beforeEach,describe,expect,it,vi} from 'vitest'
import TrainingStandardConfigurationGrants from './TrainingStandardConfigurationGrants'
const api=vi.hoisted(()=>({catalog:vi.fn(),grants:vi.fn(),issue:vi.fn(),revoke:vi.fn()}))
const materials=vi.hoisted(()=>({listTeachers:vi.fn(),set:vi.fn()}))
vi.mock('../api/standardConfigurationGrants',async()=>({...await vi.importActual<typeof import('../api/standardConfigurationGrants')>('../api/standardConfigurationGrants'),standardConfigurationGrantsApi:api}))
vi.mock('../api/materialGrants',async()=>({...await vi.importActual<typeof import('../api/materialGrants')>('../api/materialGrants'),materialGrantApi:materials}))
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
const choice={id:id(1),title:'已有合法量表',toolKey:'existing',instrumentVersion:'1',combinationHash:'a'.repeat(64),state:'ONLINE',
 versions:{CONTENT:'1',PARAMETERS:'none-v1',REPORT:'short-reviewed'},assignable:true,unavailableReason:null}
const person={id:id(2),username:'trainer-one',nickname:'培训师甲',role:'TEACHER',teacherApproved:true,isActive:true,isFrozen:false}
const person2={...person,id:id(3),username:'trainer-two',nickname:'培训师乙'}
const grant={id:id(4),userId:person.id,username:person.username,nickname:person.nickname,issuerId:id(5),version:2,revokedAt:null,combinationHash:choice.combinationHash,canManage:true}
const noGrant={code:0,data:{page:1,hasMore:false,list:[]}}
beforeEach(()=>{
 vi.clearAllMocks()
 api.catalog.mockResolvedValue({code:0,data:{page:1,hasMore:false,list:[choice]}})
 materials.listTeachers.mockResolvedValue({code:0,data:{list:[person,person2],total:2}})
 api.grants.mockResolvedValue(noGrant);api.issue.mockResolvedValue({code:0,data:{id:grant.id,version:1,revoked:false}})
 api.revoke.mockResolvedValue({code:0,data:{id:grant.id,version:3,revoked:true}})
})
async function open(){render(<TrainingStandardConfigurationGrants/>);fireEvent.click(await screen.findByRole('button',{name:'管理此配置授权'}));return screen.findByRole('dialog',{name:'分配固定量表配置'})}
async function target(dialog:HTMLElement,who=person){await within(dialog).findByRole('option',{name:who.nickname+'（'+who.username+'）'});fireEvent.change(within(dialog).getByRole('combobox',{name:'接收培训师'}),{target:{value:who.id}})}
describe('Training administrator exact combination distribution',()=>{
 it('sends the selected combination identity through the dedicated issuer API and never the legacy SCALE writer',async()=>{
  const dialog=await open();expect(within(dialog).getByText('未配置阈值或常模')).toBeVisible()
  await target(dialog);await waitFor(()=>expect(within(dialog).getByRole('button',{name:'授权此配置'})).toBeEnabled())
  fireEvent.click(within(dialog).getByRole('button',{name:'授权此配置'}))
  await waitFor(()=>expect(api.issue).toHaveBeenCalledExactlyOnceWith(choice,{requestId:expect.any(String),userId:person.id}))
  expect(materials.set).not.toHaveBeenCalled()
 })
 it('does not let a late read for another recipient populate or authorize the current selection',async()=>{
  let finish!:(v:unknown)=>void;api.grants.mockImplementation((_id,q)=>q.userId===person.id?new Promise(resolve=>{finish=resolve}):Promise.resolve(noGrant))
  const dialog=await open();await target(dialog);await target(dialog,person2)
  await within(dialog).findByText('尚未分配此固定配置')
  await act(async()=>finish({code:0,data:{page:1,hasMore:false,list:[grant]}}))
  expect(within(dialog).queryByText('该培训师已有此固定配置的使用权')).not.toBeInTheDocument()
  fireEvent.click(within(dialog).getByRole('button',{name:'授权此配置'}))
  await waitFor(()=>expect(api.issue).toHaveBeenCalledWith(choice,expect.objectContaining({userId:person2.id})))
 })
 it('blocks a second mutation after an uncertain outcome until actual grants are read back',async()=>{
  api.issue.mockRejectedValueOnce(Error('连接中断'))
  const dialog=await open();await target(dialog);await waitFor(()=>expect(within(dialog).getByRole('button',{name:'授权此配置'})).toBeEnabled())
  fireEvent.click(within(dialog).getByRole('button',{name:'授权此配置'}));await within(dialog).findByRole('alert')
  expect(within(dialog).getByRole('button',{name:'授权此配置'})).toBeDisabled();expect(api.issue).toHaveBeenCalledTimes(1)
  api.grants.mockResolvedValue({code:0,data:{page:1,hasMore:false,list:[grant]}})
  fireEvent.click(within(dialog).getByRole('button',{name:'回读当前授权状态'}))
  await within(dialog).findByText('该培训师已有此固定配置的使用权')
  expect(api.issue).toHaveBeenCalledTimes(1)
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
