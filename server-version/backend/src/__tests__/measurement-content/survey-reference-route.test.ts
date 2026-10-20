import {beforeEach,describe,it,expect,vi} from 'vitest'
const mocks=vi.hoisted(()=>({create:vi.fn(),read:vi.fn(),review:vi.fn(),publish:vi.fn(),mfa:vi.fn()}))
vi.mock('../../modules/survey/reference-candidates.service',async importOriginal=>({...await importOriginal<object>(),
  createSurveyReferenceCandidate:mocks.create,readSurveyReferenceCandidate:mocks.read,
  reviewSurveyReferenceCandidate:mocks.review,publishSurveyReferenceCandidate:mocks.publish}))
vi.mock('../../modules/survey/analytics.export.service',()=>({assertRecentSurveyMfa:mocks.mfa}))
import {surveyAnalyticsRouter} from '../../modules/survey/analytics.routes'
import {ContentAuthorityError} from '../../modules/measurement-content/content-authority'
import {ContentReleaseError} from '../../modules/measurement-content/release'
import {SurveyAnalyticsError} from '../../modules/survey/analytics.errors'
const id='00000000-0000-4000-8000-000000000001'
const evidence={methodRationale:'rationale',inclusionRule:'included',missingness:'missing',repeatResponses:'one',organizationClustering:'cluster',administrationDifferences:'same',uncertainty:'uncertain',applicability:'local',sampleAdequacy:'exploratory'}
const create=()=>({grantId:id,instrumentKey:'scale',scoreKey:'total',referenceVersion:'v1',evidence})
const review=()=>({grantId:id,decision:'APPROVED',statement:'Examined local descriptive evidence'})
const publish=()=>({grantId:id,reviewId:id,localKey:'local',version:'v1'})
async function invoke(suffix='',body:unknown=create(),method='post'){
 const path='/:pid/analytics/waves/:wid/reference-candidates'+suffix
 const handler=(surveyAnalyticsRouter as any).stack.find((x:any)=>x.route?.path===path&&x.route.methods[method]).route.stack[0].handle
 const res:any={status:vi.fn(),json:vi.fn()};res.status.mockReturnValue(res);res.json.mockReturnValue(res)
 const req={params:{pid:id,wid:id,candidateId:id},user:{userId:'authenticated-user'},body,query:{grantId:id}}
 await handler(req,res,()=>res.status(500))
 return {status:res.status.mock.calls[0]?.[0]??200,payload:res.json.mock.calls[0]?.[0],req}
}
beforeEach(()=>{vi.clearAllMocks();mocks.create.mockResolvedValue({candidateId:id,exclusionCounts:{missingValue:1},candidate:{candidateHash:'hash',measurement:{releaseId:id},definition:{entries:[]},evidence,sourceBinding:{projectId:id},sampleManifest:[{factId:'private-attempt'}]}});mocks.read.mockResolvedValue({candidateId:id});mocks.review.mockResolvedValue({reviewId:id});mocks.publish.mockResolvedValue({releaseId:id})})
describe('private descriptive reference route handlers (no HTTP transport)',()=>{
 it('uses authenticated actor and path scope; strips all individual membership from create response',async()=>{
  const result=await invoke();expect(result.status).toBe(200)
  expect(mocks.create).toHaveBeenCalledWith('authenticated-user',{...create(),projectId:id,waveId:id})
  expect(mocks.mfa.mock.invocationCallOrder[0]).toBeLessThan(mocks.create.mock.invocationCallOrder[0])
  expect(result.payload.data.sampleSize).toBe(1);expect(result.payload.data.exclusionCounts).toEqual({missingValue:1})
  expect(JSON.stringify(result.payload)).not.toContain('private-attempt');expect(result.payload.data).not.toHaveProperty('sampleManifest')
 })
 it('binds read/review/publish to server path IDs and current MFA',async()=>{
  expect((await invoke('/:candidateId',{},'get')).status).toBe(200)
  expect(mocks.read).toHaveBeenCalledWith('authenticated-user',{projectId:id,waveId:id,candidateId:id,grantId:id})
  expect((await invoke('/:candidateId/reviews',review())).status).toBe(200)
  expect(mocks.review).toHaveBeenCalledWith('authenticated-user',{...review(),projectId:id,waveId:id,candidateId:id})
  expect((await invoke('/:candidateId/publish',publish())).status).toBe(200)
  expect(mocks.publish).toHaveBeenCalledWith('authenticated-user',{...publish(),projectId:id,waveId:id,candidateId:id})
  expect(mocks.mfa).toHaveBeenCalledTimes(3)
 })
 it('rejects client identities, sample maps, formal norm flags and injected source scopes',async()=>{
  for(const extra of [{actorId:id},{projectId:id},{sampleManifest:[]},{authorizedFacts:{}},{formalNorm:true}])expect((await invoke('',{...create(),...extra})).status).toBe(400)
  expect((await invoke('/:candidateId/reviews',{...review(),reviewerId:id})).status).toBe(400)
  expect((await invoke('/:candidateId/publish',{...publish(),purpose:'NEW_ADMINISTRATION'})).status).toBe(400)
  expect(mocks.create).not.toHaveBeenCalled();expect(mocks.review).not.toHaveBeenCalled();expect(mocks.publish).not.toHaveBeenCalled()
 })
 it('fails MFA/capability/source conflicts closed and keeps unknown failures as 500',async()=>{
  mocks.mfa.mockImplementationOnce(()=>{throw new SurveyAnalyticsError(403,'recent MFA required')})
  expect((await invoke()).status).toBe(403);expect(mocks.create).not.toHaveBeenCalled()
  mocks.create.mockRejectedValueOnce(new ContentAuthorityError('CONTENT_AUTHORITY_DENIED'));expect((await invoke()).status).toBe(403)
  mocks.create.mockRejectedValueOnce(new ContentReleaseError('REFERENCE_SURVEY_SOURCE_CHANGED'));expect((await invoke()).status).toBe(409)
  mocks.create.mockRejectedValueOnce(new Error('database unavailable'));expect((await invoke()).status).toBe(500)
 })
})
