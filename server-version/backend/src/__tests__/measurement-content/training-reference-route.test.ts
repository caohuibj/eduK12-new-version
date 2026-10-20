import {beforeEach,describe,expect,it,vi} from 'vitest'
const mocks=vi.hoisted(()=>({create:vi.fn(),read:vi.fn(),review:vi.fn(),publish:vi.fn(),status:vi.fn()}))
vi.mock('../../modules/training-analysis/reference-candidates.service',async load=>({...await load<object>(),createTrainingReferenceCandidate:mocks.create,
 readTrainingReferenceCandidate:mocks.read,reviewTrainingReferenceCandidate:mocks.review,publishTrainingReferenceCandidate:mocks.publish,readTrainingReferenceRequest:mocks.status}))
import {trainingReferencesRouter} from '../../modules/training-analysis/reference.routes'
import {ContentAuthorityError} from '../../modules/measurement-content/content-authority'
import {ContentReleaseError} from '../../modules/measurement-content/release'
const id=(n:number)=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0')
const context={actorId:id(1),compositeId:id(2),courseId:id(3),grantId:id(4)}
const input=()=>({requestId:id(5),selector:{itemId:id(6),scoreKey:'total',publication:'2026-10-20T01:00:00.000Z',configDigest:null,variantKey:null},referenceVersion:'1',
 evidence:{methodRationale:'Descriptive',inclusionRule:'Valid',missingness:'Exclude',repeatResponses:'Unique',organizationClustering:'One',administrationDifferences:'Same',uncertainty:'Exploratory',applicability:'Course',sampleAdequacy:'Small'}})
async function invoke(path='/',body:unknown=input(),method='post'){
 const handler=(trainingReferencesRouter as any).stack.find((entry:any)=>entry.route?.path===path&&entry.route.methods[method]).route.stack[0].handle
 const req={user:{userId:context.actorId},params:{id:context.compositeId,courseId:context.courseId,candidateId:id(7),operation:'CREATE'},query:{grantId:context.grantId},body}
 const res:any={status:vi.fn(),json:vi.fn(),setHeader:vi.fn()};res.status.mockReturnValue(res);res.json.mockReturnValue(res)
 await handler(req,res,()=>res.status(500));return {status:res.status.mock.calls[0]?.[0]??200,body:res.json.mock.calls[0]?.[0],res}
}
beforeEach(()=>{vi.clearAllMocks();mocks.create.mockResolvedValue({candidateId:id(7)});mocks.read.mockResolvedValue({candidateId:id(7)});
 mocks.review.mockResolvedValue({reviewId:id(8)});mocks.publish.mockResolvedValue({releaseId:id(9)});mocks.status.mockResolvedValue({status:'MISSING',requestId:id(5)})})
describe('Training reference route handlers, not HTTP transport acceptance',()=>{
 it('binds authenticated actor and path course/composite, sets no-store',async()=>{
  const result=await invoke();expect(result.status).toBe(200);expect(mocks.create).toHaveBeenCalledWith(context,input());expect(result.res.setHeader).toHaveBeenCalledWith('Cache-Control','no-store')
 })
 it.each(['actorId','courseId','scope','statistics','sampleManifest','formalNorm'])('refuses forged %s input before service',async key=>{
  expect((await invoke('/',{...input(),[key]:'forged'})).status).toBe(400);expect(mocks.create).not.toHaveBeenCalled()
 })
 it('uses strict path-bound review/publish and safe read identities',async()=>{
  expect((await invoke('/:candidateId',{},'get')).status).toBe(200);expect(mocks.read).toHaveBeenCalledWith(context,{candidateId:id(7)})
  const review={requestId:id(5),candidateHash:'a'.repeat(64),decision:'APPROVED',statement:'Reviewed exact evidence'}
  expect((await invoke('/:candidateId/review',review)).status).toBe(200);expect(mocks.review).toHaveBeenCalledWith(context,{...review,candidateId:id(7)})
  expect((await invoke('/:candidateId/review',{...review,reviewerId:id(99)})).status).toBe(400)
  const publish={requestId:id(5),reviewId:id(8),localKey:'private',version:'1'}
  expect((await invoke('/:candidateId/publish',publish)).status).toBe(200);expect(mocks.publish).toHaveBeenCalledWith(context,{...publish,candidateId:id(7)})
  expect((await invoke('/:candidateId/publish',{...publish,purpose:'NEW_ADMINISTRATION'})).status).toBe(400)
 })
 it('keeps current authorization/source failures distinct from uncertain transport errors',async()=>{
  mocks.create.mockRejectedValueOnce(new ContentAuthorityError('CONTENT_AUTHORITY_DENIED'));expect((await invoke()).status).toBe(403)
  mocks.create.mockRejectedValueOnce(new ContentReleaseError('REFERENCE_TRAINING_SOURCE_CHANGED'));expect((await invoke()).status).toBe(409)
  mocks.create.mockRejectedValueOnce(new Error('database unavailable'));expect((await invoke()).status).toBe(500)
 })
 it('recovers exact operation/body rather than offering arbitrary UUID lookup',async()=>{
  expect((await invoke('/request-status/:operation')).body.data).toEqual({status:'MISSING',requestId:id(5)})
  expect(mocks.status).toHaveBeenCalledWith(context,'CREATE',input())
 })
})
