import {beforeEach,describe,it,expect,vi} from 'vitest'
import {render,screen,fireEvent,waitFor} from '@testing-library/react'
import AdminContentPermissions from './AdminContentPermissions'
const mocks=vi.hoisted(()=>({get:vi.fn(),post:vi.fn()}))
vi.mock('../api/client',()=>({default:mocks}))
const id=(n:number)=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0')
function fill(){
 for(const [label,value] of [['目标研究者 UUID',id(1)],['项目 UUID',id(2)],['精确资源 UUID（逗号或换行分隔）',id(3)],['生效时间（本地时间）','2098-10-20T06:00'],['到期时间（本地时间）','2098-10-21T06:00'],['内容授权原因','Approved research']])fireEvent.change(screen.getByLabelText(label),{target:{value}})
}
beforeEach(()=>{vi.clearAllMocks();sessionStorage.clear();vi.spyOn(window,'confirm').mockReturnValue(true);mocks.post.mockResolvedValue({data:{grantId:id(4),version:1}})})
describe('explicit system content capability form',()=>{
 it('does not fetch any data automatically and validates before issuing',async()=>{
  render(<AdminContentPermissions actorId={id(9)}/>);expect(mocks.get).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button',{name:'确认签发内容授权'}));expect(await screen.findByRole('alert')).toHaveTextContent('有效 UUID');expect(mocks.post).not.toHaveBeenCalled()
 })
 it('issues only selected exact reference capabilities after confirmation and prevents accidental duplicates',async()=>{
  render(<AdminContentPermissions actorId={id(9)}/>);fill();fireEvent.click(screen.getByLabelText('reference.review'))
  fireEvent.click(screen.getByRole('button',{name:'确认签发内容授权'}))
  await waitFor(()=>expect(mocks.post).toHaveBeenCalledTimes(1))
  expect(mocks.post.mock.calls[0][1]).toMatchObject({expectedVersion:0,grant:{subjectId:id(1),scope:{product:'SURVEY',scopeKind:'PROJECT',scopeId:id(2),resourceKind:'reference',resourceKeys:[id(3)]},capabilities:['reference.review'],delegableCapabilities:[],remainingDelegationDepth:0}})
  await waitFor(()=>expect(screen.getByRole('button',{name:'确认签发内容授权'})).toBeDisabled())
  expect(window.confirm).toHaveBeenCalled();expect(mocks.get).not.toHaveBeenCalled()
 })
 it('preserves identical request UUID and body across ambiguous failure and retry',async()=>{
  mocks.post.mockRejectedValueOnce(new Error('Network interrupted'))
  render(<AdminContentPermissions actorId={id(9)}/>);fill();fireEvent.click(screen.getByLabelText('reference.analyze'));fireEvent.click(screen.getByLabelText('允许上述能力一层受限委派'))
  fireEvent.click(screen.getByRole('button',{name:'确认签发内容授权'}));await screen.findByRole('alert')
  expect(screen.getByLabelText('项目 UUID')).toBeDisabled()
  fireEvent.click(screen.getByRole('button',{name:'重试同一签发请求'}))
  await waitFor(()=>expect(mocks.post).toHaveBeenCalledTimes(2))
  expect(mocks.post.mock.calls[1][1]).toEqual(mocks.post.mock.calls[0][1]);expect(mocks.post.mock.calls[0][1].requestId).toMatch(/^[0-9a-f-]{36}$/)
  expect(mocks.post.mock.calls[0][1].grant.delegableCapabilities).toEqual(['reference.analyze'])
 })
 it('switches data to only data.reinterpret and sends no raw data or implicit admin grants',async()=>{
  render(<AdminContentPermissions actorId={id(9)}/>);fireEvent.change(screen.getByLabelText('资源类型'),{target:{value:'data'}});fill()
  fireEvent.click(screen.getByRole('button',{name:'确认签发内容授权'}));await waitFor(()=>expect(mocks.post).toHaveBeenCalledTimes(1))
  expect(mocks.post.mock.calls[0][1].grant.capabilities).toEqual(['data.reinterpret']);expect(mocks.post.mock.calls[0][1].grant.scope.resourceKind).toBe('data')
 })
 it('revokes only read metadata version and clears stale displayed scope on lookup edit',async()=>{
  mocks.get.mockResolvedValue({data:{grantId:id(4),version:7,parentGrantId:null,subjectId:id(1),issuerId:id(9),scope:{scopeId:id(2),resourceKind:'data',resourceKeys:[id(3)]},capabilities:['data.reinterpret'],delegableCapabilities:[],validFrom:'2026-10-20',expiresAt:'2026-10-21',revokedAt:null}})
  render(<AdminContentPermissions actorId={id(9)}/>);fireEvent.change(screen.getByLabelText('授权 UUID'),{target:{value:id(4)}});fireEvent.click(screen.getByRole('button',{name:'读取授权元数据'}));await screen.findByLabelText('撤销原因')
  fireEvent.change(screen.getByLabelText('撤销原因'),{target:{value:'Withdraw'}});fireEvent.click(screen.getByRole('button',{name:'确认撤销已读授权'}))
  await waitFor(()=>expect(mocks.post).toHaveBeenCalledWith('/admin/permissions/content-grants/'+id(4)+'/revoke',{expectedVersion:7,reason:'Withdraw'}))
  await waitFor(()=>expect(screen.queryByLabelText('撤销原因')).not.toBeInTheDocument())
 })
})

it('cancelled explicit confirmation never sends the mutation',async()=>{
 vi.mocked(window.confirm).mockReturnValue(false)
 render(<AdminContentPermissions actorId={id(9)}/>);fill();fireEvent.click(screen.getByLabelText('reference.publish'))
 fireEvent.click(screen.getByRole('button',{name:'确认签发内容授权'}))
 expect(window.confirm).toHaveBeenCalled();expect(mocks.post).not.toHaveBeenCalled()
})

it('restores the same admin pending body after unmount and never shares it with another admin',async()=>{
 mocks.post.mockRejectedValueOnce(new Error('response lost'))
 const first=render(<AdminContentPermissions actorId={id(9)}/>);fill();fireEvent.click(screen.getByLabelText('reference.review'))
 fireEvent.click(screen.getByRole('button',{name:'确认签发内容授权'}));await screen.findByRole('alert')
 const request=mocks.post.mock.calls[0][1];first.unmount()
 const other=render(<AdminContentPermissions actorId={id(8)}/>);expect(screen.queryByRole('button',{name:'重试同一签发请求'})).not.toBeInTheDocument();other.unmount()
 render(<AdminContentPermissions actorId={id(9)}/>);fireEvent.click(screen.getByRole('button',{name:'重试同一签发请求'}))
 await waitFor(()=>expect(mocks.post).toHaveBeenCalledTimes(2));expect(mocks.post.mock.calls[1][1]).toEqual(request)
 await waitFor(()=>expect(sessionStorage.getItem('admin-content-pending:'+id(9))).toBeNull())
})
it('warns and protects unload when browser storage is unavailable',async()=>{
 const fail=vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw new Error('blocked')})
 mocks.post.mockRejectedValueOnce(new Error('response lost'))
 render(<AdminContentPermissions actorId={id(9)}/>);fill();fireEvent.click(screen.getByLabelText('reference.review'))
 fireEvent.click(screen.getByRole('button',{name:'确认签发内容授权'}));await screen.findByText(/浏览器无法保存待核对请求/)
 const event=new Event('beforeunload',{cancelable:true});window.dispatchEvent(event);expect(event.defaultPrevented).toBe(true)
 fail.mockRestore()
})

it('allows editing after an explicit first rejection but retains step-up requests',async()=>{
 mocks.post.mockRejectedValueOnce({status:403,message:'内容授权范围或当前身份无效'})
 render(<AdminContentPermissions actorId={id(9)}/>);fill();fireEvent.click(screen.getByLabelText('reference.review'))
 fireEvent.click(screen.getByRole('button',{name:'确认签发内容授权'}));await screen.findByText(/本次请求明确未执行/)
 expect(screen.getByLabelText('项目 UUID')).not.toBeDisabled()
 mocks.post.mockRejectedValueOnce({status:403,message:'内容授权变更需要最近的安全密钥验证'})
 fireEvent.click(screen.getByRole('button',{name:'确认签发内容授权'}));await screen.findByRole('button',{name:'重试同一签发请求'})
 expect(screen.getByLabelText('项目 UUID')).toBeDisabled()
})
it('ends a response-lost request only after reading its exact existing grant',async()=>{
 mocks.post.mockRejectedValueOnce(new Error('response lost'))
 render(<AdminContentPermissions actorId={id(9)}/>);fill();fireEvent.click(screen.getByLabelText('reference.review'))
 fireEvent.click(screen.getByRole('button',{name:'确认签发内容授权'}));await screen.findByRole('alert')
 const body=mocks.post.mock.calls[0][1]
 mocks.get.mockResolvedValue({data:{...body.grant,grantId:body.requestId,version:2,parentGrantId:null,issuerId:id(9),revokedAt:'2026-10-20T06:00:00Z'}})
 fireEvent.click(screen.getByRole('button',{name:'读取授权元数据'}));await screen.findByRole('button',{name:'按已读记录结束待核对请求'})
 fireEvent.click(screen.getByRole('button',{name:'按已读记录结束待核对请求'}))
 expect(screen.queryByRole('button',{name:'重试同一签发请求'})).not.toBeInTheDocument()
 expect(sessionStorage.getItem('admin-content-pending:'+id(9))).toBeNull()
 expect(screen.getByRole('button',{name:'编制另一份授权'})).toBeInTheDocument()
})
it('refuses an already expired new grant before sending',async()=>{
 render(<AdminContentPermissions actorId={id(9)}/>);fill();fireEvent.click(screen.getByLabelText('reference.review'))
 fireEvent.change(screen.getByLabelText('生效时间（本地时间）'),{target:{value:'2000-01-01T00:00'}})
 fireEvent.change(screen.getByLabelText('到期时间（本地时间）'),{target:{value:'2001-01-01T00:00'}})
 fireEvent.click(screen.getByRole('button',{name:'确认签发内容授权'}));expect(mocks.post).not.toHaveBeenCalled()
})

it('a later explicit denial cannot erase an earlier unknown result',async()=>{
 mocks.post.mockRejectedValueOnce(new Error('response lost')).mockRejectedValueOnce({status:403,message:'内容授权范围或当前身份无效'})
 render(<AdminContentPermissions actorId={id(9)}/>);fill();fireEvent.click(screen.getByLabelText('reference.review'))
 fireEvent.click(screen.getByRole('button',{name:'确认签发内容授权'}));await screen.findByRole('alert')
 const first=mocks.post.mock.calls[0][1]
 fireEvent.click(screen.getByRole('button',{name:'重试同一签发请求'}));await waitFor(()=>expect(mocks.post).toHaveBeenCalledTimes(2))
 expect(mocks.post.mock.calls[1][1]).toEqual(first);expect(screen.getByLabelText('项目 UUID')).toBeDisabled()
 expect(JSON.parse(sessionStorage.getItem('admin-content-pending:'+id(9))!).request.requestId).toBe(first.requestId)
})
