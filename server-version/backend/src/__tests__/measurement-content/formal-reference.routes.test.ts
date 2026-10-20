import {beforeEach,describe,expect,it,vi} from 'vitest'
const mocks=vi.hoisted(()=>({submit:vi.fn(),read:vi.fn(),review:vi.fn(),publish:vi.fn(),grants:vi.fn(),mfa:vi.fn()}))
vi.mock('../../modules/measurement-content/formal-reference.service',()=>({
  submitFormalReferenceCandidate:mocks.submit,readFormalReferenceCandidate:mocks.read,
  reviewFormalReferenceCandidate:mocks.review,publishFormalReferenceCandidate:mocks.publish,readFormalReferenceAuthorities:mocks.grants,
}))
vi.mock('../../modules/survey/analytics.export.service',()=>({assertRecentSurveyMfa:mocks.mfa}))
import {formalReferenceRouter,surveyFormalReferenceRouter} from '../../modules/measurement-content/formal-reference.routes'
import {ContentAuthorityError} from '../../modules/measurement-content/content-authority'
import {ContentReleaseError} from '../../modules/measurement-content/release'
async function invoke(router:any,path:string,method='post'){
  const handler=router.stack.find((entry:any)=>entry.route?.path===path&&entry.route.methods[method]).route.stack[0].handle
  const res:any={status:vi.fn(),json:vi.fn()};res.status.mockReturnValue(res);res.json.mockReturnValue(res)
  const req={body:{candidateId:'exact-candidate'},user:{userId:'authenticated-user'}}
  await handler(req,res,()=>res.status(500))
  return {status:res.status.mock.calls[0]?.[0]??200,payload:res.json.mock.calls[0]?.[0]}
}
beforeEach(()=>{vi.resetAllMocks();process.env.SURVEY_ANALYTICS_ENABLED='true'})
describe('formal route authentication wiring (handler contracts, not live HTTP)',()=>{
  it('routes platform governance only through authenticated Training actor',async()=>{
    await invoke(formalReferenceRouter,'/submissions')
    expect(mocks.submit).toHaveBeenCalledWith('authenticated-user','TRAINING',{candidateId:'exact-candidate'})
    for(const [path,mock] of [['/read',mocks.read],['/reviews',mocks.review],['/publish',mocks.publish]] as const){
      await invoke(formalReferenceRouter,path);expect(mock).toHaveBeenCalledWith('authenticated-user',{candidateId:'exact-candidate'})
    }
    await invoke(formalReferenceRouter,'/capabilities','get');expect(mocks.grants).toHaveBeenCalledWith('authenticated-user')
  })
  it('Survey exposes submission only and preserves current MFA/analytics gate',async()=>{
    await invoke(surveyFormalReferenceRouter,'/submissions')
    expect(mocks.mfa).toHaveBeenCalledOnce()
    expect(mocks.submit).toHaveBeenCalledWith('authenticated-user','SURVEY',{candidateId:'exact-candidate'})
    expect((surveyFormalReferenceRouter as any).stack.filter((entry:any)=>entry.route).map((entry:any)=>entry.route.path)).toEqual(['/submissions'])
    process.env.SURVEY_ANALYTICS_ENABLED='false'
    expect((await invoke(surveyFormalReferenceRouter,'/submissions')).status).toBe(404)
  })
  it('fails capability and source conflicts closed without fabricating success',async()=>{
    mocks.review.mockRejectedValueOnce(new ContentAuthorityError('CONTENT_AUTHORITY_DENIED'))
    expect((await invoke(formalReferenceRouter,'/reviews')).status).toBe(403)
    mocks.publish.mockRejectedValueOnce(new ContentReleaseError('REFERENCE_REVIEW_STALE'))
    expect((await invoke(formalReferenceRouter,'/publish')).status).toBe(409)
    mocks.read.mockRejectedValueOnce(new Error('Unknown transport'))
    expect((await invoke(formalReferenceRouter,'/read')).status).toBe(500)
  })
})
