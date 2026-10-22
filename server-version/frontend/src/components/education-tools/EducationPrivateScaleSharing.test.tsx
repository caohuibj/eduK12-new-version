import {cleanup,fireEvent,render,screen,waitFor,within} from '@testing-library/react'
import {afterEach,describe,expect,it,vi} from 'vitest'
import {EducationPrivateScaleSharing} from './EducationPrivateScaleSharing'
import type {PrivateToolApi} from './privateToolClient'
const metadata={title:'固定量表',author:'作者',copyright:'自有',applicability:'研究',scoringDescription:'求和',reportDescription:'描述'}
const mediaManifest={schemaVersion:1,manifestHash:'manifest',releaseIds:['release'],items:[{assetId:'asset',contentHash:'image-hash',mimeType:'image/png',sizeBytes:3,assetVersion:'1',usages:['ITEM'],rights:'AUTHOR_SHARED_FOR_BOUND_SCALE',dependencyReleaseIds:[]}]}
const prepared={sourceId:'tool',versionId:'version',privateContentHash:'private-hash',product:'SCHOOL',releaseId:'release',contentHash:'release-hash',defaults:metadata,mediaManifest,canRequestLibraryShare:true}
const row={id:'submission',sourceId:'tool',versionId:'version',privateContentHash:'private-hash',product:'SCHOOL',releaseId:'release',version:4,status:'SUBMITTED',metadata,supportedEntrypoints:[],dependencyReleaseIds:[],createdAt:'2026-10-22'}
const props={entry:'SCHOOL' as const,organizationId:'org',actorId:'author',toolId:'tool',version:{id:'version',title:'固定量表',sourceRevision:2,contentHash:'private-hash'}}
async function prepare(){await screen.findByText('当前量表没有申请记录。');fireEvent.click(screen.getByRole('button',{name:'准备此固定版本的入库申请'}));await screen.findByLabelText('量表名称')}
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals()})
describe('private-scale application session',()=>{
 it('locks editing and navigation after unknown submission, retries exactly the original body and request identity',async()=>{
  let writes=0
  const api=vi.fn(async(path:string,method='GET')=>{
   if(path.endsWith('/prepare'))return prepared
   if(path.endsWith('/submissions')&&method==='POST'){if(++writes===1)throw Error('network interrupted');return row}
   return {list:[],hasMore:false}
  })
  const draft=vi.fn();render(<EducationPrivateScaleSharing {...props} api={api as PrivateToolApi} onDraftStateChange={draft}/>);await prepare()
  expect(screen.getByRole('button',{name:'提交此版本入库申请'})).toBeDisabled()
  fireEvent.click(screen.getByRole('checkbox'))
  fireEvent.click(screen.getByRole('button',{name:'提交此版本入库申请'}))
  await screen.findByText(/提交结果尚未确认/)
  expect(screen.getByLabelText('量表名称')).toBeDisabled();expect(screen.getByRole('checkbox')).toBeDisabled()
  expect(draft).toHaveBeenLastCalledWith({dirty:true,writing:true})
  const unload=new Event('beforeunload',{cancelable:true});window.dispatchEvent(unload);expect(unload.defaultPrevented).toBe(true)
  fireEvent.click(screen.getByRole('button',{name:'按原申请编号及内容重试'}))
  await screen.findByText(/入库申请已提交，等待管理员审核/)
  const calls=api.mock.calls.filter(([path,method])=>path.endsWith('/submissions')&&method==='POST')
  expect(calls).toHaveLength(2)
  // Inspect captured transport arguments, not a regenerated client payload.
  const bodies=(api.mock.calls as unknown[][]).filter(([path,method])=>String(path).endsWith('/submissions')&&method==='POST').map(call=>call[2])
  expect(bodies[1]).toBe(bodies[0]);expect(bodies[0]).toEqual(expect.objectContaining({contentHash:'private-hash',releaseId:'release',requestId:expect.any(String),dependencyReleaseIds:[],mediaConsent:{manifestHash:'manifest',shareWithAuthorizedUsers:true}}))
  expect(bodies[0]).not.toHaveProperty('educationApplicability')
  expect(draft).toHaveBeenLastCalledWith({dirty:false,writing:false})
  fireEvent.click(screen.getByRole('checkbox'))
  expect(screen.getByRole('button',{name:'提交此版本入库申请'})).toBeDisabled()
  fireEvent.click(screen.getByRole('button',{name:'提交此版本入库申请'}))
  expect(writes).toBe(2)
 })
 it('invalidates preparation and media consent after an explicit 4xx rejection',async()=>{
  const api=vi.fn(async(path:string,method='GET')=>{if(path.endsWith('/prepare'))return prepared;if(method==='POST')throw Object.assign(Error('conflict'),{status:409});return {list:[],hasMore:false}})
  render(<EducationPrivateScaleSharing {...props} api={api as PrivateToolApi}/>);await prepare();fireEvent.click(screen.getByRole('checkbox'));fireEvent.click(screen.getByRole('button',{name:'提交此版本入库申请'}))
  await screen.findByText(/附件同意已清除/)
  expect(screen.queryByRole('button',{name:'按原申请编号及内容重试'})).not.toBeInTheDocument()
  expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button',{name:'准备此固定版本的入库申请'}));await screen.findByRole('checkbox')
  expect(screen.getByRole('checkbox')).not.toBeChecked();expect(screen.getByRole('button',{name:'提交此版本入库申请'})).toBeDisabled()
 })
 it('clears attachment consent and draft inputs across actor scope changes',async()=>{
  const api=vi.fn(async(path:string)=>path.endsWith('/prepare')?prepared:{list:[],hasMore:false})
  const {rerender}=render(<EducationPrivateScaleSharing {...props} api={api as PrivateToolApi}/>);await prepare();fireEvent.click(screen.getByRole('checkbox'))
  fireEvent.change(screen.getByLabelText('量表名称'),{target:{value:'旧作者未提交文字'}})
  rerender(<EducationPrivateScaleSharing {...props} actorId="new-author" api={api as PrivateToolApi}/>);await prepare()
  expect(screen.getByRole('checkbox')).not.toBeChecked();expect(screen.getByLabelText('量表名称')).toHaveValue('固定量表')
 })
 it('loads attachment bytes only on explicit preview, reuses the scoped adapter while metadata changes, and revokes on actor switch',async()=>{
  const create=vi.fn(()=> 'blob:sharing-image'),revoke=vi.fn()
  vi.stubGlobal('URL',class extends URL {static createObjectURL=create;static revokeObjectURL=revoke})
  const blob=new Blob(['png'],{type:'image/png'})
  const api=vi.fn(async(path:string)=>path.endsWith('/prepare')?prepared:path.includes('/preview?')?blob:{list:[],hasMore:false})
  const {rerender}=render(<EducationPrivateScaleSharing {...props} api={api as PrivateToolApi}/>);await prepare()
  expect(api.mock.calls.some(([path])=>path.includes('/preview'))).toBe(false)
  fireEvent.click(screen.getByRole('button',{name:'读取获授权的附件预览'}))
  await waitFor(()=>expect(create).toHaveBeenCalledTimes(1))
  expect(api).toHaveBeenCalledWith('/organizations/org/private-tools/tool/versions/version/sharing/media/asset/preview?releaseId=release','GET',undefined,{responseType:'blob'})
  fireEvent.change(screen.getByLabelText('量表名称'),{target:{value:'更改文案'}})
  expect(api.mock.calls.filter(([path])=>path.includes('/preview'))).toHaveLength(1)
  expect(api.mock.calls.every(([path])=>path.startsWith('/organizations/org/private-tools/tool/'))).toBe(true)
  rerender(<EducationPrivateScaleSharing {...props} actorId="second-author" api={api as PrivateToolApi}/>)
  await screen.findByText('当前量表没有申请记录。')
  expect(revoke).toHaveBeenCalledWith('blob:sharing-image')
  expect(screen.queryByAltText('入库附件 asset')).not.toBeInTheDocument()
 })
 it('shows bounded history and immutable detail, withdrawing only submitted snapshots with version and reason',async()=>{
  const api=vi.fn(async(path:string,method='GET')=>{
   if(path.endsWith('/withdraw'))return {...row,status:'WITHDRAWN',version:5}
   if(path.endsWith('/submissions/submission'))return {...row,mediaManifest:{...mediaManifest,items:[]},snapshot:{marker:'SERVER_FROZEN_SNAPSHOT'}}
   if(method==='GET')return {list:[row],hasMore:true}
   throw Error('Unexpected '+path)
  })
  render(<EducationPrivateScaleSharing {...props} api={api as PrivateToolApi}/>)
  await screen.findByText('当前仅显示最近 100 条申请，不代表全部历史；暂不提供继续翻页。')
  expect(screen.queryByRole('button',{name:/下一页|加载更多/})).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button',{name:'查看申请 submission'}))
  const detail=await screen.findByRole('region',{name:'申请冻结详情'})
  expect(within(detail).getByText(/SERVER_FROZEN_SNAPSHOT/)).toBeInTheDocument()
  expect(screen.getByRole('button',{name:'撤回此申请'})).toBeDisabled()
  fireEvent.change(screen.getByLabelText('撤回说明'),{target:{value:'  重新修订  '}});fireEvent.click(screen.getByRole('button',{name:'撤回此申请'}))
  await waitFor(()=>expect(api).toHaveBeenCalledWith('/organizations/org/private-tools/tool/sharing/submissions/submission/withdraw','POST',{expectedVersion:4,reason:'重新修订'}))
  await screen.findByText(/申请已撤回/);expect(screen.queryByRole('button',{name:'撤回此申请'})).not.toBeInTheDocument()
 })
})
