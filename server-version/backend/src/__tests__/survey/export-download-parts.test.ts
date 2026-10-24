import {beforeEach,describe,expect,it,vi} from 'vitest'
const m=vi.hoisted(()=>({download:vi.fn()}))
vi.mock('../../middleware/auth',()=>({authenticateSurvey:vi.fn()}))
vi.mock('../../middleware/redisRateLimit',()=>({createRedisRateLimiter:()=>vi.fn()}))
vi.mock('../../modules/survey/analytics.export.service',()=>({createSurveyExport:vi.fn(),downloadSurveyExport:m.download}))
import {surveyExportsRouter} from '../../modules/survey/analytics.export.routes'
import {SurveyAnalyticsError} from '../../modules/survey/analytics.read'
const artifact={id:'22222222-2222-4222-8222-222222222222',format:'RAW_WAVE',csv:'"safe","0012"\r\n',codebook:{variables:['synthetic']},manifest:{sourceProjectRevision:1}}
const handler=(surveyExportsRouter as any).stack.find((layer:any)=>layer.route?.methods.get).route.stack.at(-1).handle
async function invoke(query:unknown={}){
  const request={query,params:{projectId:'11111111-1111-4111-8111-111111111111',exportId:artifact.id},user:{userId:'researcher'}}
  const res:any={status:vi.fn(),json:vi.fn()};res.status.mockReturnValue(res);res.json.mockReturnValue(res)
  const next=vi.fn();await handler(request,res,next);return {request,res,next}
}
beforeEach(()=>{vi.clearAllMocks();m.download.mockResolvedValue(artifact)})
describe('Survey export file response projection',()=>{
  it.each(['csv','codebook','manifest'] as const)('returns only %s after the existing fresh authorization service',async part=>{
    const {res,request}=await invoke({part})
    expect(m.download).toHaveBeenCalledWith(request,{projectId:request.params.projectId,exportId:artifact.id})
    expect(res.json.mock.calls[0][0].data).toEqual({id:artifact.id,format:artifact.format,[part]:artifact[part]})
  })
  it('preserves the full response for older clients',async()=>{
    const {res}=await invoke();expect(res.json.mock.calls[0][0].data).toEqual(artifact)
  })
  it.each([{part:'__proto__'},{part:['csv','manifest']},{unknown:'csv'}])('rejects ambiguous/unknown selections before loading a ticket: %j',async query=>{
    const {res}=await invoke(query);expect(res.status).toHaveBeenCalledWith(400);expect(m.download).not.toHaveBeenCalled()
  })
  it.each([403,404,409])('preserves fresh service refusal %i without exposing any file',async code=>{
    m.download.mockRejectedValue(new SurveyAnalyticsError(code,'refused'))
    const {res}=await invoke({part:'csv'});expect(res.status).toHaveBeenCalledWith(code);expect(res.json.mock.calls[0][0].data).toBeNull()
  })
})
