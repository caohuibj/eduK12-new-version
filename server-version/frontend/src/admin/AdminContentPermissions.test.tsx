import {beforeEach,describe,it,expect,vi} from 'vitest'
import {render,screen,fireEvent,waitFor} from '@testing-library/react'
import AdminContentPermissions from './AdminContentPermissions'
const mocks=vi.hoisted(()=>({get:vi.fn(),post:vi.fn()}))
vi.mock('../api/client',()=>({default:mocks}))
const id=(n:number)=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0')
function openComposer(){const summary=screen.getByText('编制精确内容授权');if(!summary.closest('details')?.open)fireEvent.click(summary)}
function fill(){
 openComposer()
 for(const [label,value] of [['目标研究者 UUID',id(1)],['项目 UUID',id(2)],['精确资源 UUID（逗号或换行分隔）',id(3)],['生效时间（本地时间）','2098-10-20T06:00'],['到期时间（本地时间）','2098-10-21T06:00'],['内容授权原因','Approved research']])fireEvent.change(screen.getByLabelText(label),{target:{value}})
}
beforeEach(()=>{vi.clearAllMocks();sessionStorage.clear();vi.spyOn(window,'confirm').mockReturnValue(true);mocks.post.mockReset().mockImplementation(async(url,body)=>({data:{grantId:url.endsWith('/revoke')?url.split('/')[url.split('/').length-2]:body.requestId,version:url.endsWith('/revoke')?body.expectedVersion+1:1}}))})
describe('explicit system content capability form',()=>{
 it('does not fetch any data automatically and validates before issuing',async()=>{
  render(<AdminContentPermissions actorId={id(9)}/>);expect(mocks.get).not.toHaveBeenCalled()
  openComposer();fireEvent.click(screen.getByRole('button',{name:'确认签发内容授权'}));expect(await screen.findByRole('alert')).toHaveTextContent('有效 UUID');expect(mocks.post).not.toHaveBeenCalled()
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
  mocks.get.mockResolvedValue({data:{grantId:id(4),version:7,parentGrantId:null,subjectId:id(1),issuerId:id(9),scope:{product:'SURVEY',scopeKind:'PROJECT',scopeId:id(2),resourceKind:'data',resourceKeys:[id(3)]},capabilities:['data.reinterpret'],delegableCapabilities:[],remainingDelegationDepth:0,validFrom:'2026-10-20',expiresAt:'2026-10-21',revokedAt:null}})
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

it.each([false,true])('step-up then denial retains only requests with unknown transport history: %s',async unknown=>{
 mocks.post.mockRejectedValueOnce({status:403,message:'内容授权变更需要最近的安全密钥验证'})
 if(unknown)mocks.post.mockRejectedValueOnce(new Error('response lost'))
 mocks.post.mockRejectedValueOnce({status:403,message:'内容授权范围或当前身份无效'})
 render(<AdminContentPermissions actorId={id(9)}/>);fill();fireEvent.click(screen.getByLabelText('reference.review'))
 fireEvent.click(screen.getByRole('button',{name:'确认签发内容授权'}));await screen.findByRole('alert')
 if(unknown){fireEvent.click(screen.getByRole('button',{name:'重试同一签发请求'}));await waitFor(()=>expect(mocks.post).toHaveBeenCalledTimes(2));await waitFor(()=>expect(screen.getByRole('button',{name:'重试同一签发请求'})).not.toBeDisabled())}
 fireEvent.click(screen.getByRole('button',{name:'重试同一签发请求'}));await waitFor(()=>expect(mocks.post).toHaveBeenCalledTimes(unknown?3:2))
 await waitFor(()=>{if(unknown)expect(screen.getByLabelText('项目 UUID')).toBeDisabled();else expect(screen.getByLabelText('项目 UUID')).not.toBeDisabled()})
})
it('switches only to exact Training course report capabilities and clears Survey selections',async()=>{
 render(<AdminContentPermissions actorId={id(9)}/>);fill();fireEvent.click(screen.getByLabelText('reference.review'))
 fireEvent.change(screen.getByLabelText('产品授权范围'),{target:{value:'TRAINING'}})
 expect(screen.getByLabelText('课程 UUID')).toHaveValue('');expect(screen.getByLabelText('精确资源 UUID（逗号或换行分隔）')).toHaveValue('')
 expect(screen.queryByLabelText('reference.review')).not.toBeInTheDocument();expect(screen.queryByLabelText('资源类型')).not.toBeInTheDocument()
 fireEvent.change(screen.getByLabelText('课程 UUID'),{target:{value:id(2)}})
 fireEvent.change(screen.getByLabelText('精确资源 UUID（逗号或换行分隔）'),{target:{value:id(3)}})
 fireEvent.click(screen.getByLabelText('report.edit'));fireEvent.click(screen.getByLabelText('report.publish'))
 fireEvent.click(screen.getByRole('button',{name:'确认签发内容授权'}));await waitFor(()=>expect(mocks.post).toHaveBeenCalledTimes(1))
 expect(mocks.post.mock.calls[0][1].grant).toMatchObject({subjectId:id(1),scope:{product:'TRAINING',scopeKind:'COURSE',scopeId:id(2),resourceKind:'report',resourceKeys:[id(3)]},capabilities:['report.edit','report.publish'],delegableCapabilities:[]})
})
it('keeps the product scope locked after an unknown outcome',async()=>{
 mocks.post.mockRejectedValueOnce(new Error('response lost'))
 render(<AdminContentPermissions actorId={id(9)}/>);fill();fireEvent.click(screen.getByLabelText('reference.analyze'))
 fireEvent.click(screen.getByRole('button',{name:'确认签发内容授权'}));await screen.findByRole('alert')
 expect(screen.getByLabelText('产品授权范围')).toBeDisabled()
 fireEvent.click(screen.getByRole('button',{name:'重试同一签发请求'}));await waitFor(()=>expect(mocks.post).toHaveBeenCalledTimes(2))
 expect(mocks.post.mock.calls[1][1]).toEqual(mocks.post.mock.calls[0][1]);expect(mocks.post.mock.calls[1][1].grant.scope.product).toBe('SURVEY')
})

it.each([
 ['reference','COURSE','reference',['reference.analyze','reference.review','reference.publish']],
 ['data','COURSE','data',['data.reinterpret']],
 ['reference-governance','PLATFORM','reference',['reference.review','reference.publish']],
] as const)('issues only the fixed Training %s scope and capabilities',async(purpose,scopeKind,resourceKind,capabilities)=>{
 render(<AdminContentPermissions actorId={id(9)}/>);fill();fireEvent.click(screen.getByLabelText('reference.analyze'))
 fireEvent.change(screen.getByLabelText('产品授权范围'),{target:{value:'TRAINING'}})
 fireEvent.change(screen.getByLabelText('Training 授权用途'),{target:{value:purpose}})
 expect(screen.getByLabelText('精确资源 UUID（逗号或换行分隔）')).toHaveValue('')
 if(scopeKind==='COURSE')fireEvent.change(screen.getByLabelText('课程 UUID'),{target:{value:id(2)}})
 else {expect(screen.queryByLabelText('课程 UUID')).not.toBeInTheDocument();expect(screen.queryByLabelText('reference.analyze')).not.toBeInTheDocument()}
 fireEvent.change(screen.getByLabelText('精确资源 UUID（逗号或换行分隔）'),{target:{value:id(3)}})
 for(const cap of capabilities)if(cap!=='data.reinterpret')fireEvent.click(screen.getByLabelText(cap))
 fireEvent.click(screen.getByRole('button',{name:'确认签发内容授权'}));await waitFor(()=>expect(mocks.post).toHaveBeenCalledTimes(1))
 expect(mocks.post.mock.calls[0][1].grant).toMatchObject({scope:{product:'TRAINING',scopeKind,scopeId:scopeKind==='PLATFORM'?'reference-governance':id(2),resourceKind,resourceKeys:[id(3)]},capabilities:[...capabilities],delegableCapabilities:[]})
})
it('clears scope-specific selections on Training purpose changes',()=>{
 render(<AdminContentPermissions actorId={id(9)}/>);fireEvent.change(screen.getByLabelText('产品授权范围'),{target:{value:'TRAINING'}})
 fireEvent.click(screen.getByLabelText('report.publish'));fireEvent.click(screen.getByLabelText('允许上述能力一层受限委派'))
 fireEvent.change(screen.getByLabelText('课程 UUID'),{target:{value:id(2)}});fireEvent.change(screen.getByLabelText('精确资源 UUID（逗号或换行分隔）'),{target:{value:id(3)}})
 fireEvent.change(screen.getByLabelText('Training 授权用途'),{target:{value:'reference-governance'}})
 expect(screen.queryByLabelText('report.publish')).not.toBeInTheDocument();expect(screen.queryByLabelText('reference.analyze')).not.toBeInTheDocument()
 expect(screen.getByLabelText('reference.publish')).not.toBeChecked();expect(screen.getByLabelText('允许上述能力一层受限委派')).not.toBeChecked()
 expect(screen.getByLabelText('精确资源 UUID（逗号或换行分隔）')).toHaveValue('')
})
it('restores visible pending fields and never carries them into an actor rerender',async()=>{
 mocks.post.mockRejectedValueOnce(new Error('response lost'))
 const view=render(<AdminContentPermissions actorId={id(9)}/>);fill();fireEvent.click(screen.getByLabelText('reference.review'))
 fireEvent.click(screen.getByRole('button',{name:'确认签发内容授权'}));await screen.findByRole('alert')
 view.rerender(<AdminContentPermissions actorId={id(8)}/>);expect(screen.getByLabelText('项目 UUID')).toHaveValue('')
 expect(screen.queryByRole('button',{name:'重试同一签发请求'})).not.toBeInTheDocument()
 view.rerender(<AdminContentPermissions actorId={id(9)}/>);expect(screen.getByLabelText('项目 UUID')).toHaveValue(id(2))
 expect(screen.getByLabelText('内容授权原因')).toHaveValue('Approved research');expect(screen.getByLabelText('reference.review')).toBeChecked()
 expect(screen.getByLabelText('项目 UUID')).toBeDisabled()
})
it('does not finish unknown issuance from an unrelated grant body sharing the requested ID',async()=>{
 mocks.post.mockRejectedValueOnce(new Error('response lost'))
 render(<AdminContentPermissions actorId={id(9)}/>);fill();fireEvent.click(screen.getByLabelText('reference.review'))
 fireEvent.click(screen.getByRole('button',{name:'确认签发内容授权'}));await screen.findByRole('alert')
 const body=mocks.post.mock.calls[0][1]
 mocks.get.mockResolvedValue({data:{...body.grant,subjectId:id(8),grantId:body.requestId,version:1,parentGrantId:null,issuerId:id(9),revokedAt:null}})
 fireEvent.click(screen.getByRole('button',{name:'读取授权元数据'}));await screen.findByLabelText('撤销原因')
 expect(screen.queryByRole('button',{name:'按已读记录结束待核对请求'})).not.toBeInTheDocument()
 expect(screen.getByRole('button',{name:'重试同一签发请求'})).toBeInTheDocument()
})
it('treats an unrelated issuance response as unknown instead of issuing another request',async()=>{
 mocks.post.mockResolvedValueOnce({data:{grantId:id(8),version:1}})
 render(<AdminContentPermissions actorId={id(9)}/>);fill();fireEvent.click(screen.getByLabelText('reference.review'))
 fireEvent.click(screen.getByRole('button',{name:'确认签发内容授权'}));await screen.findByText(/授权响应与原请求不一致/)
 expect(screen.queryByRole('button',{name:'编制另一份授权'})).not.toBeInTheDocument();expect(screen.getByLabelText('项目 UUID')).toBeDisabled()
})

const revokeMetadata=()=>({grantId:id(4),version:7,parentGrantId:null,subjectId:id(1),issuerId:id(9),scope:{product:'SURVEY',scopeKind:'PROJECT',scopeId:id(2),resourceKind:'data',resourceKeys:[id(3)]},capabilities:['data.reinterpret'],delegableCapabilities:[],remainingDelegationDepth:0,validFrom:'2026-10-20',expiresAt:'2026-10-21',revokedAt:null})
async function readForRevoke(){
 mocks.get.mockResolvedValue({data:revokeMetadata()})
 fireEvent.change(screen.getByLabelText('授权 UUID'),{target:{value:id(4)}});fireEvent.click(screen.getByRole('button',{name:'读取授权元数据'}));await screen.findByLabelText('撤销原因')
 fireEvent.change(screen.getByLabelText('撤销原因'),{target:{value:'Exact withdrawal'}})
}
it('retains exact unknown revocation inputs across remount and later rejection',async()=>{
 const view=render(<AdminContentPermissions actorId={id(9)}/>);await readForRevoke()
 mocks.post.mockRejectedValueOnce(new Error('response lost'));fireEvent.click(screen.getByRole('button',{name:'确认撤销已读授权'}));await screen.findByText(/撤销尚未确认/)
 const request=mocks.post.mock.calls[0]
 expect(screen.getByLabelText('撤销原因')).toBeDisabled();expect(screen.getByLabelText('授权 UUID')).toBeDisabled()
 view.unmount();render(<AdminContentPermissions actorId={id(9)}/>);expect(screen.getByLabelText('授权 UUID')).toHaveValue(id(4))
 mocks.post.mockRejectedValueOnce({status:403,message:'内容授权范围或当前身份无效'})
 fireEvent.click(screen.getByRole('button',{name:'重试同一撤销请求'}));await screen.findByText(/撤销尚未确认/)
 expect(mocks.post.mock.calls[1]).toEqual(request);expect(screen.getByRole('button',{name:'确认签发内容授权'})).toBeDisabled()
 fireEvent.click(screen.getByRole('button',{name:'重试同一撤销请求'}));await screen.findByText('撤销已确认，请重新读取当前状态。')
 expect(mocks.post.mock.calls[2]).toEqual(request);expect(sessionStorage.getItem('admin-content-revoke:'+id(9))).toBeNull()
})
it('can resolve an unknown revocation only after reading the same grant actually revoked',async()=>{
 render(<AdminContentPermissions actorId={id(9)}/>);await readForRevoke()
 mocks.post.mockRejectedValueOnce(new Error('response lost'));fireEvent.click(screen.getByRole('button',{name:'确认撤销已读授权'}));await screen.findByText(/撤销尚未确认/)
 expect(screen.queryByRole('button',{name:'按已读撤销状态结束请求'})).not.toBeInTheDocument()
 mocks.get.mockResolvedValue({data:{...revokeMetadata(),version:8,revokedAt:'2026-10-20T07:00:00Z'}})
 fireEvent.click(screen.getByRole('button',{name:'读取授权元数据'}));await screen.findByRole('button',{name:'按已读撤销状态结束请求'})
 fireEvent.click(screen.getByRole('button',{name:'按已读撤销状态结束请求'}))
 expect(screen.queryByRole('button',{name:'重试同一撤销请求'})).not.toBeInTheDocument();expect(sessionStorage.getItem('admin-content-revoke:'+id(9))).toBeNull()
})
it('blocks restoration of a stored grant with a wider unsupported scientific scope',()=>{
 sessionStorage.setItem('admin-content-pending:'+id(9),JSON.stringify({actorId:id(9),request:{requestId:id(5),expectedVersion:0,reason:'invalid',grant:{...revokeMetadata(),scope:{product:'TRAINING',scopeKind:'PLATFORM',scopeId:'reference-governance',resourceKind:'reference',resourceKeys:[id(3)]},capabilities:['reference.analyze']}}}))
 render(<AdminContentPermissions actorId={id(9)}/>);expect(screen.getByRole('button',{name:'确认签发内容授权'})).toBeDisabled();expect(mocks.post).not.toHaveBeenCalled()
})

describe('exact scale library authority',()=>{
 it.each([
  ['TRAINING','library-review','catalog','catalog.manage','目标审核账号 UUID'],
  ['SURVEY','library-distribute','material','material.distribute','目标入口管理员 UUID'],
 ])('issues %s %s only in the fixed platform scope',async(product,purpose,resourceKind,capability,subjectLabel)=>{
  render(<AdminContentPermissions actorId={id(9)}/>)
  fireEvent.change(screen.getByLabelText('产品授权范围'),{target:{value:product}})
  fireEvent.change(screen.getByLabelText(product==='TRAINING'?'Training 授权用途':'Survey 授权用途'),{target:{value:purpose}})
  for(const [label,value] of [[subjectLabel,id(1)],['精确资源 UUID（逗号或换行分隔）',id(3)],['生效时间（本地时间）','2098-10-20T06:00'],['到期时间（本地时间）','2098-10-21T06:00'],['内容授权原因','明确版本范围']])fireEvent.change(screen.getByLabelText(label),{target:{value}})
  expect(screen.queryByLabelText('项目 UUID')).not.toBeInTheDocument()
  expect(screen.queryByLabelText('课程 UUID')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button',{name:'确认签发内容授权'}))
  await waitFor(()=>expect(mocks.post).toHaveBeenCalledTimes(1))
  expect(mocks.post.mock.calls[0][1].grant).toMatchObject({scope:{product,scopeKind:'PLATFORM',scopeId:'scale-library-governance',resourceKind,resourceKeys:[id(3)]},capabilities:[capability],delegableCapabilities:[],remainingDelegationDepth:0})
 })
 it('restores a pending library review request using its original exact grant',async()=>{
  const request={requestId:id(8),expectedVersion:0,reason:'精确审核',grant:{subjectId:id(1),scope:{product:'TRAINING',scopeKind:'PLATFORM',scopeId:'scale-library-governance',resourceKind:'catalog',resourceKeys:[id(3)]},capabilities:['catalog.manage'],delegableCapabilities:[],remainingDelegationDepth:0,validFrom:'2098-10-20T06:00:00Z',expiresAt:'2098-10-21T06:00:00Z'}}
  sessionStorage.setItem('admin-content-pending:'+id(9),JSON.stringify({actorId:id(9),request,hadUnknownOutcome:true}))
  render(<AdminContentPermissions actorId={id(9)}/>)
  fireEvent.click(screen.getByRole('button',{name:'重试同一签发请求'}))
  await waitFor(()=>expect(mocks.post).toHaveBeenCalledWith('/admin/permissions/content-grants',request))
 })
})

describe('exact nondelegable Survey SJT distribution preset',()=>{
 const request=()=>({requestId:id(8),expectedVersion:0,reason:'独立 Survey 入口授权',grant:{subjectId:id(1),scope:{product:'SURVEY',scopeKind:'PLATFORM',scopeId:'situational-library-governance',resourceKind:'material',resourceKeys:[id(3)]},capabilities:['material.distribute'],delegableCapabilities:[] as string[],remainingDelegationDepth:0,validFrom:'2098-10-20T06:00:00Z',expiresAt:'2098-10-21T06:00:00Z'}})
 function selectPreset(){fireEvent.change(screen.getByLabelText('Survey 授权用途'),{target:{value:'sjt-distribute'}})}
 function fillPreset(){
  for(const [label,value] of [['目标 Survey 入口管理员 UUID',id(1)],['精确资源 UUID（逗号或换行分隔）',id(3)],['生效时间（本地时间）','2098-10-20T06:00'],['到期时间（本地时间）','2098-10-21T06:00'],['内容授权原因','独立 Survey 入口授权']])fireEvent.change(screen.getByLabelText(label),{target:{value}})
 }
 it('requires explicit confirmation for only Survey material.distribute over exact releases without delegation',async()=>{
  render(<AdminContentPermissions actorId={id(9)}/>);selectPreset();fillPreset()
  expect(mocks.post).not.toHaveBeenCalled();expect(mocks.get).not.toHaveBeenCalled()
  expect(screen.queryByLabelText('项目 UUID')).not.toBeInTheDocument();expect(screen.queryByLabelText('课程 UUID')).not.toBeInTheDocument()
  expect(screen.queryByLabelText('资源类型')).not.toBeInTheDocument();expect(screen.queryByLabelText('允许上述能力一层受限委派')).not.toBeInTheDocument()
  expect(screen.getByText(/不升级现有课程授权/)).toBeInTheDocument()
  vi.mocked(window.confirm).mockReturnValueOnce(false)
  fireEvent.click(screen.getByRole('button',{name:'确认签发内容授权'}));expect(mocks.post).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button',{name:'确认签发内容授权'}))
  await waitFor(()=>expect(mocks.post).toHaveBeenCalledTimes(1))
  expect(mocks.post.mock.calls[0][1]).toMatchObject({...request(),requestId:expect.any(String),grant:{...request().grant,validFrom:new Date('2098-10-20T06:00').toISOString(),expiresAt:new Date('2098-10-21T06:00').toISOString()}})
  expect(window.confirm).toHaveBeenLastCalledWith(expect.stringContaining('situational-library-governance'))
  expect(window.confirm).toHaveBeenLastCalledWith(expect.stringContaining('不允许委派'))
 })
 it('clears old resources/capabilities/delegation and does not carry the new preset across products',()=>{
  render(<AdminContentPermissions actorId={id(9)}/>);fill();fireEvent.click(screen.getByLabelText('reference.review'));fireEvent.click(screen.getByLabelText('允许上述能力一层受限委派'))
  selectPreset()
  expect(screen.getByLabelText('精确资源 UUID（逗号或换行分隔）')).toHaveValue('')
  expect(screen.queryByLabelText('reference.review')).not.toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('产品授权范围'),{target:{value:'TRAINING'}})
  expect(screen.getByLabelText('Training 授权用途')).toHaveValue('report');expect(screen.getByLabelText('课程 UUID')).toHaveValue('')
  expect(screen.getByLabelText('report.publish')).not.toBeChecked();expect(screen.getByLabelText('允许上述能力一层受限委派')).not.toBeChecked()
  expect(screen.queryByRole('option',{name:'SJT 精确版本入口分发'})).not.toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('产品授权范围'),{target:{value:'SURVEY'}})
  expect(screen.getByLabelText('Survey 授权用途')).toHaveValue('report');expect(screen.getByLabelText('项目 UUID')).toHaveValue('')
 })
 it('restores and retries the exact response-lost request after remount, preserving its nondelegable scope',async()=>{
  mocks.post.mockRejectedValueOnce(new Error('response lost'))
  const view=render(<AdminContentPermissions actorId={id(9)}/>);selectPreset();fillPreset()
  fireEvent.click(screen.getByRole('button',{name:'确认签发内容授权'}));await screen.findByRole('alert')
  const issued=mocks.post.mock.calls[0][1];view.unmount();render(<AdminContentPermissions actorId={id(9)}/>)
  expect(screen.getByLabelText('Survey 授权用途')).toHaveValue('sjt-distribute');expect(screen.getByLabelText('Survey 授权用途')).toBeDisabled()
  expect(screen.getByLabelText('目标 Survey 入口管理员 UUID')).toHaveValue(id(1));expect(screen.getByLabelText('精确资源 UUID（逗号或换行分隔）')).toHaveValue(id(3))
  fireEvent.click(screen.getByRole('button',{name:'重试同一签发请求'}));await waitFor(()=>expect(mocks.post).toHaveBeenCalledTimes(2))
  expect(mocks.post.mock.calls[1][1]).toEqual(issued)
 })
 it('reads exact metadata to resolve unknown issuance, then permits explicit versioned revocation',async()=>{
  const pending=request()
  sessionStorage.setItem('admin-content-pending:'+id(9),JSON.stringify({actorId:id(9),request:pending,hadUnknownOutcome:true}))
  mocks.get.mockResolvedValue({data:{...pending.grant,grantId:pending.requestId,issuerId:id(9),parentGrantId:null,version:1,revokedAt:null}})
  render(<AdminContentPermissions actorId={id(9)}/>);fireEvent.click(screen.getByRole('button',{name:'读取授权元数据'}))
  await screen.findByRole('button',{name:'按已读记录结束待核对请求'});fireEvent.click(screen.getByRole('button',{name:'按已读记录结束待核对请求'}))
  expect(sessionStorage.getItem('admin-content-pending:'+id(9))).toBeNull();expect(mocks.post).not.toHaveBeenCalled()
  fireEvent.change(screen.getByLabelText('撤销原因'),{target:{value:'撤销精确入口分发'}});fireEvent.click(screen.getByRole('button',{name:'确认撤销已读授权'}))
  await waitFor(()=>expect(mocks.post).toHaveBeenCalledWith('/admin/permissions/content-grants/'+pending.requestId+'/revoke',{expectedVersion:1,reason:'撤销精确入口分发'}))
 })
 it.each(['training','course','project','scope','resource-kind','wildcard','duplicate','capabilities','delegation-depth','delegable'])('blocks altered stored SJT distribution request: %s',variant=>{
  const pending=request()
  if(variant==='training')pending.grant.scope.product='TRAINING'
  if(variant==='course')pending.grant.scope.scopeKind='COURSE'
  if(variant==='project')pending.grant.scope.scopeKind='PROJECT'
  if(variant==='scope')pending.grant.scope.scopeId='situational-registry'
  if(variant==='resource-kind')pending.grant.scope.resourceKind='measurement'
  if(variant==='wildcard')pending.grant.scope.resourceKeys=['*']
  if(variant==='duplicate')pending.grant.scope.resourceKeys=[id(3),id(3)]
  if(variant==='capabilities')pending.grant.capabilities.push('material.adapt')
  if(variant==='delegation-depth')pending.grant.remainingDelegationDepth=1
  if(variant==='delegable')pending.grant.delegableCapabilities=['material.distribute']
  sessionStorage.setItem('admin-content-pending:'+id(9),JSON.stringify({actorId:id(9),request:pending,hadUnknownOutcome:true}))
  render(<AdminContentPermissions actorId={id(9)}/>)
  expect(screen.getByRole('button',{name:'确认签发内容授权'})).toBeDisabled();expect(screen.getByRole('alert')).toHaveTextContent('保存的请求无法恢复')
  expect(mocks.post).not.toHaveBeenCalled()
 })
})
