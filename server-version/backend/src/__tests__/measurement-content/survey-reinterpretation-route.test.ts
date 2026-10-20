import {beforeEach,describe,it,expect,vi} from 'vitest'
const mocks=vi.hoisted(()=>({create:vi.fn(),read:vi.fn(),mfa:vi.fn()}))
vi.mock('../../modules/survey/reinterpretation.service',()=>({createSurveyReinterpretation:mocks.create,readSurveyReinterpretation:mocks.read}))
vi.mock('../../modules/survey/analytics.export.service',()=>({assertRecentSurveyMfa:mocks.mfa}))
import {surveyAnalyticsRouter} from '../../modules/survey/analytics.routes'
import {ContentAuthorityError} from '../../modules/measurement-content/content-authority'
import {SurveyAnalyticsError} from '../../modules/survey/analytics.errors'
const id='00000000-0000-4000-8000-000000000001'
const body=()=>({requestId:id,grantId:id,instrumentKey:'scale',reportReleaseId:id,references:[]})
const route=(method:string,suffix:string)=>(surveyAnalyticsRouter as any).stack.find((layer:any)=>layer.route?.path===`/:pid/analytics/waves/:wid/finals/:finalId${suffix}`&&layer.route.methods[method]).route.stack[0].handle
async function invoke(payload:unknown=body(),method='post'){
 const res:any={status:vi.fn(),json:vi.fn()};res.status.mockReturnValue(res);res.json.mockReturnValue(res)
 const req={params:{pid:id,wid:id,finalId:id,artifactId:id},user:{userId:'authenticated-user'},body:payload}
 await route(method,method==='post'?'/interpretations':'/interpretations/:artifactId')(req,res,()=>res.status(500))
 return {status:res.status.mock.calls[0]?.[0]??200,req}
}
beforeEach(()=>{vi.clearAllMocks();mocks.create.mockResolvedValue({artifactId:id});mocks.read.mockResolvedValue({artifactId:id})})
describe('actual router handler contract, without network/HTTP transport',()=>{
 it('uses authenticated actor and path FINAL; checks recent MFA before service',async()=>{
  const result=await invoke();expect(result.status).toBe(200)
  expect(mocks.mfa).toHaveBeenCalledWith(result.req)
  expect(mocks.create).toHaveBeenCalledWith('authenticated-user',{...body(),projectId:id,waveId:id,finalId:id})
  expect(mocks.mfa.mock.invocationCallOrder[0]).toBeLessThan(mocks.create.mock.invocationCallOrder[0])
 })
 it('rejects client actor, source facts and path substitutions',async()=>{
  for(const extra of [{actorId:'admin'},{scores:[5]},{finalId:id},{populationContext:{age:12}}])expect((await invoke({...body(),...extra})).status).toBe(400)
  expect(mocks.create).not.toHaveBeenCalled()
 })
 it('enforces MFA, capability errors and preserves unknown server errors',async()=>{
  mocks.mfa.mockImplementationOnce(()=>{throw new SurveyAnalyticsError(403,'recent MFA required')})
  expect((await invoke()).status).toBe(403);expect(mocks.create).not.toHaveBeenCalled()
  mocks.create.mockRejectedValueOnce(new ContentAuthorityError('CONTENT_AUTHORITY_DENIED'));expect((await invoke()).status).toBe(403)
  mocks.create.mockRejectedValueOnce(new Error('database failed'));expect((await invoke()).status).toBe(500)
 })
 it('uses authenticated actor and recent MFA for immutable artifact reads',async()=>{
  expect((await invoke({},'get')).status).toBe(200);expect(mocks.mfa).toHaveBeenCalledTimes(1)
  expect(mocks.read).toHaveBeenCalledWith('authenticated-user',{projectId:id,waveId:id,finalId:id,artifactId:id})
 })
})
