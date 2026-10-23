import {describe,expect,it,vi} from 'vitest'
import {createPrivateScaleSharingClient} from './educationPrivateScaleSharingClient'
import type {PrivateToolApi} from './privateToolClient'
const metadata={title:'量表',author:'作者',copyright:'自有',applicability:'研究',scoringDescription:'求和',reportDescription:'描述'}
const prepared={sourceId:'tool/a',versionId:'v/a',privateContentHash:'private-hash',product:'SCHOOL',releaseId:'release/a',contentHash:'release-hash',defaults:metadata,mediaManifest:{schemaVersion:1,manifestHash:'manifest',items:[],releaseIds:['release/a']},canRequestLibraryShare:true}
describe('education private sharing client exact scope',()=>{
 it('sends private hashes to scoped prepare/submit and previews through the existing Blob transport',async()=>{
  const blob=new Blob(['png'],{type:'image/png'})
  const api=vi.fn(async(path:string)=>path.endsWith('/prepare')?prepared:path.includes('/preview')?blob:{...prepared,id:'request',metadata,status:'SUBMITTED'})
  const client=createPrivateScaleSharingClient(api as PrivateToolApi,'org/a','tool/a','SCHOOL')
  await client.prepare('v/a','private-hash')
  expect(api).toHaveBeenCalledWith('/organizations/org%2Fa/private-tools/tool%2Fa/versions/v%2Fa/sharing/prepare','POST',{contentHash:'private-hash'})
  const body={contentHash:'private-hash',releaseId:'release/a',requestId:'idempotency',metadata,dependencyReleaseIds:[] as []}
  await client.submit('v/a',body)
  expect(api).toHaveBeenCalledWith('/organizations/org%2Fa/private-tools/tool%2Fa/versions/v%2Fa/sharing/submissions','POST',body)
  expect(await client.preview({versionId:'v/a',releaseId:'release/a'},'asset/a','image/png')).toBe(blob)
  expect(api).toHaveBeenLastCalledWith('/organizations/org%2Fa/private-tools/tool%2Fa/versions/v%2Fa/sharing/media/asset%2Fa/preview?releaseId=release%2Fa','GET',undefined,{responseType:'blob'})
 })
 it.each([{privateContentHash:'release-hash'},{product:'TEACHER'},{sourceId:'other'},{versionId:'other'},{contentHash:''},{mediaManifest:{schemaVersion:1,manifestHash:'bad',items:[{assetId:'a',contentHash:'h',mimeType:'video/mp4'}]}}])('rejects prepare identity or manifest mismatch %j',async mismatch=>{
  const api=vi.fn().mockResolvedValue({...prepared,...mismatch})
  await expect(createPrivateScaleSharingClient(api as PrivateToolApi,'org','tool/a','SCHOOL').prepare('v/a','private-hash')).rejects.toThrow('申请准备信息与固定版本不一致')
  expect(api).toHaveBeenCalledTimes(1)
 })
 it.each(['video/mp4','application/pdf'])('accepts %s only from the exact fixed-version sharing endpoint',async mimeType=>{
  const blob=new Blob(['synthetic'],{type:mimeType}),api=vi.fn().mockResolvedValue(blob)
  const client=createPrivateScaleSharingClient(api as PrivateToolApi,'org','tool/a','SCHOOL')
  expect(await client.preview({versionId:'v/a',releaseId:'release/a'},'asset',mimeType)).toBe(blob)
  expect(api).toHaveBeenCalledWith('/organizations/org/private-tools/tool%2Fa/versions/v%2Fa/sharing/media/asset/preview?releaseId=release%2Fa','GET',undefined,{responseType:'blob'})
 })
 it('rejects mismatched submission results and unexpected image content types',async()=>{
  const api=vi.fn().mockResolvedValueOnce({...prepared,id:'request',metadata,status:'SUBMITTED',privateContentHash:'wrong'}).mockResolvedValueOnce(new Blob(['html'],{type:'text/html'}))
  const client=createPrivateScaleSharingClient(api as PrivateToolApi,'org','tool/a','SCHOOL')
  await expect(client.submit('v/a',{contentHash:'private-hash',releaseId:'release/a',requestId:'request',metadata,dependencyReleaseIds:[]})).rejects.toThrow('提交结果身份不一致')
  await expect(client.preview({submissionId:'request/a'},'asset','image/png')).rejects.toThrow('有效素材预览')
  expect(api).toHaveBeenLastCalledWith('/organizations/org/private-tools/tool%2Fa/sharing/submissions/request%2Fa/media/asset/preview','GET',undefined,{responseType:'blob'})
 })
})
