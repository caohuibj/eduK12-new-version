import express from 'express'
import type {Server} from 'node:http'
import {randomUUID} from 'node:crypto'
import {afterAll,beforeAll,beforeEach,describe,expect,it,vi} from 'vitest'
const m=vi.hoisted(()=>({prepare:vi.fn(),submit:vi.fn(),list:vi.fn(),read:vi.fn(),withdraw:vi.fn(),media:vi.fn(),serve:vi.fn()}))
vi.mock('../../modules/education-tools/private-tool.sharing.service',()=>({preparePrivateScaleSharing:m.prepare,submitPrivateScaleSharing:m.submit,listPrivateScaleSharing:m.list,readPrivateScaleSharing:m.read,withdrawPrivateScaleSharing:m.withdraw,readPrivateScaleSharingMedia:m.media}))
vi.mock('../../modules/education-tools/private-tool.sharing.media',()=>({servePrivateScaleSharingImage:m.serve}))
import {privateToolSharingRouter} from '../../modules/education-tools/private-tool.sharing.routes'
import {ScaleLibraryError} from '../../modules/scale-library-governance/contracts'
import {EducationPrivateToolError} from '../../modules/education-tools/private-tool.contracts'
const org=randomUUID(),tool=randomUUID(),version=randomUUID(),owner=randomUUID(),submission=randomUUID(),asset=randomUUID(),release=randomUUID()
let server:Server,url:string
beforeAll(async()=>{
 const app=express();app.use(express.json())
 for(const entry of ['SCHOOL','TEACHER'] as const)app.use(`/${entry}/organizations/:organizationId/private-tools`,privateToolSharingRouter(req=>({principal:{userId:owner,accountDomain:'SCHOOL'},entry,organizationId:req.params.organizationId})))
 app.use((_error:unknown,_req:express.Request,res:express.Response,_next:express.NextFunction)=>{res.status(500).json({code:'INTERNAL_ERROR'})})
 server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));const address=server.address()
 if(!address||typeof address==='string')throw new Error('missing test port');url='http://127.0.0.1:'+address.port
})
afterAll(async()=>{server?.closeAllConnections();if(server)await new Promise<void>(resolve=>server.close(()=>resolve()))})
beforeEach(()=>{vi.clearAllMocks();m.prepare.mockResolvedValue({releaseId:release});m.submit.mockResolvedValue({status:'SUBMITTED'});m.list.mockResolvedValue({list:[]})})
const base=(entry='SCHOOL')=>`${url}/${entry}/organizations/${org}/private-tools/${tool}`
const post=(path:string,body:unknown)=>fetch(path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)})
describe('Education share router uses parent-selected context, no governance escalation',()=>{
 it.each(['SCHOOL','TEACHER'] as const)('uses %s entry and scoped organization on explicit prepare',async entry=>{
  const response=await post(base(entry)+`/versions/${version}/sharing/prepare`,{contentHash:'a'.repeat(64)})
  expect(response.status).toBe(200);expect(response.headers.get('cache-control')).toBe('no-store')
  expect(m.prepare).toHaveBeenCalledWith({principal:{userId:owner,accountDomain:'SCHOOL'},entry,organizationId:org},tool,version,{contentHash:'a'.repeat(64)})
 })
 it('does not expose review, grants or approved entry status changes',async()=>{
  for(const suffix of [`/sharing/submissions/${submission}/review`,`/sharing/entries/${submission}/grants`,`/sharing/entries/${submission}/status`]){
   expect((await post(base()+suffix,{decision:'APPROVE'})).status).toBe(404)
  }
  expect(m.submit).not.toHaveBeenCalled();expect(m.withdraw).not.toHaveBeenCalled()
 })
 it('preserves scoped forbidden/not-found errors and duplicate conflict',async()=>{
  for(const [error,status] of [[new EducationPrivateToolError('PRIVATE_TOOL_AUTHOR_REQUIRED',403),403],[new ScaleLibraryError(404,'EDUCATION_LIBRARY_SOURCE_INVALID'),404],[{code:'P2002'},409]] as const){
   m.prepare.mockRejectedValueOnce(error)
   expect((await post(base()+`/versions/${version}/sharing/prepare`,{})).status).toBe(status)
  }
 })
 it('rejects malformed identities before invoking submission service',async()=>{
  expect((await post(base()+'/versions/not-a-uuid/sharing/submissions',{})).status).toBe(400)
  expect(m.submit).not.toHaveBeenCalled()
 })
 it('serves source images only after scoped exact-release manifest resolution',async()=>{
  const manifest={items:[]};m.media.mockResolvedValue(manifest);m.serve.mockImplementation(async(res:express.Response)=>res.status(200).end())
  const response=await fetch(base()+`/versions/${version}/sharing/media/${asset}/preview?releaseId=${release}`)
  expect(response.status).toBe(200)
  expect(m.media).toHaveBeenCalledWith({principal:{userId:owner,accountDomain:'SCHOOL'},entry:'SCHOOL',organizationId:org},tool,version,release)
  expect(m.serve).toHaveBeenCalledWith(expect.anything(),manifest,asset)
  expect(m.prepare).not.toHaveBeenCalled()
 })
})
