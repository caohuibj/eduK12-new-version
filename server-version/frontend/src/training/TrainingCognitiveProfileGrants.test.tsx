import {beforeEach,describe,it,expect,vi} from 'vitest'
import {render,screen,waitFor} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
const m=vi.hoisted(()=>({catalog:vi.fn(),uses:vi.fn(),preview:vi.fn(),send:vi.fn(),operation:vi.fn(),teachers:vi.fn()}))
vi.mock('../api/cognitiveProfileGrants',async()=>({...await vi.importActual('../api/cognitiveProfileGrants'),cognitiveProfileGrantsApi:m}))
vi.mock('../api/materialGrants',()=>({materialGrantApi:{listTeachers:m.teachers},eligibleGrantTeachers:(x:unknown)=>x}))
import {Workspace} from './TrainingCognitiveProfileGrants'
import {validCognitiveProfilePending,sameCognitiveProfileOperation} from '../api/cognitiveProfileGrants'
const id=(n:number)=>`${n.toString().padStart(8,'0')}-1111-4111-8111-111111111111`,actor=id(1),recipient=id(2),cfg=id(3),hash='a'.repeat(64)
beforeEach(()=>{vi.clearAllMocks();sessionStorage.clear();m.catalog.mockResolvedValue({code:0,data:{hasMore:false,list:[{configId:cfg,title:'简单反应时',profile:'research',artifactHash:hash,available:true}]}})
 m.preview.mockResolvedValue({code:0,data:{artifactHash:hash,reportStyle:{title:'本次任务报告',profile:'research',headline:[{key:'rt',label:'反应时'}],detail:[],caveats:[],disclaimer:''}}})
 m.teachers.mockResolvedValue({code:0,data:{list:[{id:recipient,username:'synthetic teacher'}],total:1}});m.uses.mockResolvedValue({code:0,data:{hasMore:false,list:[]}})
 m.send.mockRejectedValue(Error('Response lost'));m.operation.mockResolvedValue({code:0,data:null})})
async function fill(){const user=userEvent.setup();await user.selectOptions(await screen.findByLabelText('测验与报告'),hash);await screen.findByRole('heading',{name:'本次任务报告'})
 await user.selectOptions(screen.getByLabelText('接收培训师'),recipient);await waitFor(()=>expect(m.uses).toHaveBeenCalled())
 await user.type(screen.getByLabelText('配置名称'),'课堂研究报告');await user.type(screen.getByLabelText('结束时间'),'2080-01-01T09:00');return user}
describe('fixed cognitive profile manager recovery',()=>{
 it('retains an uncertain write and retries only the same request after absent readback',async()=>{
  render(<Workspace actorId={actor}/>);const user=await fill();await user.click(screen.getByRole('button',{name:'授权此固定配置'}));await screen.findByText('Response lost')
  expect(m.send).toHaveBeenCalledTimes(1);const request=m.send.mock.calls[0][0];expect(validCognitiveProfilePending(request)).toBe(true)
  expect(screen.getByRole('button',{name:'授权此固定配置'})).toBeDisabled();expect(screen.queryByRole('button',{name:'重试同一请求'})).not.toBeInTheDocument()
  await user.click(screen.getByRole('button',{name:'回读原请求'}));await screen.findByRole('button',{name:'重试同一请求'})
  await user.click(screen.getByRole('button',{name:'重试同一请求'}));await waitFor(()=>expect(m.send).toHaveBeenCalledTimes(2));expect(m.send.mock.calls[1][0]).toEqual(request)
  expect(JSON.parse(sessionStorage.getItem('training-cognitive-profile-request:'+actor)!)).toEqual(request)
 })
 it('refuses a conflicting recovery receipt and preserves the pending original',async()=>{
  render(<Workspace actorId={actor}/>);const user=await fill();await user.click(screen.getByRole('button',{name:'授权此固定配置'}));await screen.findByText('Response lost')
  const request=m.send.mock.calls[0][0];m.operation.mockResolvedValue({code:0,data:{kind:'ISSUE',profile:'experience',request:request.body,grant:{id:request.body.requestId,version:1,revokedAt:null}}})
  await user.click(screen.getByRole('button',{name:'回读原请求'}));await screen.findByText('原请求的配置、接收者或修订不一致，停止新增写入。')
  expect(sessionStorage.getItem('training-cognitive-profile-request:'+actor)).not.toBeNull();expect(m.send).toHaveBeenCalledTimes(1)
 })
 it('validates persisted revoke intent without throwing on incomplete stored data',()=>{
  expect(validCognitiveProfilePending({kind:'REVOKE',configId:cfg,grantId:recipient,body:{requestId:id(7),expectedVersion:1,reason:null}})).toBe(false)
  const p={kind:'ISSUE' as const,configId:cfg,profile:'research' as const,body:{requestId:id(8),userId:recipient,artifactHash:hash,configurationName:'配置',validFrom:'2026-01-01T00:00:00.000Z',expiresAt:'2080-01-01T00:00:00.000Z'}}
  expect(validCognitiveProfilePending(p)).toBe(true)
  expect(sameCognitiveProfileOperation(p,{kind:'ISSUE',profile:'research',request:{...p.body,artifactHash:'b'.repeat(64)},grant:{id:p.body.requestId,version:1,revokedAt:null},selectedBinding:{} as never})).toBe(false)
 })
})
