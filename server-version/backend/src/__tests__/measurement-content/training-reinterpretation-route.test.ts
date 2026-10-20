import {beforeEach,describe,it,expect,vi} from 'vitest'
const mocks=vi.hoisted(()=>({create:vi.fn(),read:vi.fn(),export:vi.fn()}))
vi.mock('../../modules/questionnaire-product/reinterpretation.service',async original=>({...await original<typeof import('../../modules/questionnaire-product/reinterpretation.service')>(),
 createTrainingReinterpretation:mocks.create,readTrainingReinterpretation:mocks.read,exportTrainingReinterpretation:mocks.export}))
import {trainingReinterpretationsRouter} from '../../modules/questionnaire-product/reinterpretation.routes'
import {ContentAuthorityError} from '../../modules/measurement-content/content-authority'
const id='00000000-0000-4000-8000-000000000001'
const body=()=>({requestId:id,itemId:id,reason:'Explicit new report',reportReleaseId:id,references:[]})
const route=(method:string,path:string)=>(trainingReinterpretationsRouter as any).stack.find((layer:any)=>layer.route?.path===path&&layer.route.methods[method]).route.stack[0].handle
async function invoke(method='post',path='/',payload:unknown=body(),query:unknown={grantId:id}){
 const req={params:{id,courseId:id,attemptId:id,artifactId:id},user:{userId:'authenticated-user'},body:payload,query}
 const res:any={setHeader:vi.fn(),status:vi.fn(),json:vi.fn()};res.status.mockReturnValue(res);res.json.mockReturnValue(res)
 await route(method,path)(req,res,()=>res.status(500));return {res,status:res.status.mock.calls[0]?.[0]??200}
}
beforeEach(()=>{vi.clearAllMocks();mocks.create.mockResolvedValue({});mocks.read.mockResolvedValue({});mocks.export.mockResolvedValue({})})
describe('Training artifact actual route handler contracts, no transport claim',()=>{
 it('takes actor only from auth and source scope only from path with no-store',async()=>{
  const result=await invoke();expect(result.status).toBe(200);expect(result.res.setHeader).toHaveBeenCalledWith('Cache-Control','no-store')
  expect(mocks.create).toHaveBeenCalledWith({actorId:'authenticated-user',compositeId:id,courseId:id,attemptId:id,grantId:id},body())
 })
 it('rejects client source facts, actor or unknown query keys before service',async()=>{
  for(const extra of [{actorId:id},{metrics:[]},{populationContext:{}},{attemptId:id}])expect((await invoke('post','/',{...body(),...extra})).status).toBe(400)
  expect((await invoke('post','/',body(),{grantId:id,latest:'true'})).status).toBe(400);expect(mocks.create).not.toHaveBeenCalled()
 })
 it('uses separate explicit GET artifact/export operations and exact grant',async()=>{
  expect((await invoke('get','/:artifactId')).status).toBe(200);expect((await invoke('get','/:artifactId/export')).status).toBe(200)
  expect(mocks.read).toHaveBeenCalledWith(expect.objectContaining({grantId:id}),id);expect(mocks.export).toHaveBeenCalledWith(expect.objectContaining({grantId:id}),id)
  expect(mocks.create).not.toHaveBeenCalled()
 })
 it('propagates denied current data capability as 403 and keeps unknown failures 500',async()=>{
  mocks.export.mockRejectedValueOnce(new ContentAuthorityError('CONTENT_AUTHORITY_DENIED'));expect((await invoke('get','/:artifactId/export')).status).toBe(403)
  mocks.create.mockRejectedValueOnce(new Error('db'));expect((await invoke()).status).toBe(500)
 })
})
