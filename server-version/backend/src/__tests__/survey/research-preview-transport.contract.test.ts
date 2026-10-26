import {afterEach,describe,expect,it,vi} from 'vitest'
import {surveyBuilderRouter} from '../../modules/survey/builder.routes'
import * as service from '../../modules/survey/builder.service'

// Route-schema unit test only. Real authentication/authorization is exercised
// separately through the loopback HTTP integration harness.
const handler=(surveyBuilderRouter as any).stack.find((layer:any)=>
  layer.route?.path==='/:pid/instruments/:iid/preview').route.stack[0].handle
const request=(answers:unknown)=>({user:{userId:'actor'},params:{
  pid:'11111111-1111-4111-8111-111111111111',iid:'22222222-2222-4222-8222-222222222222'},body:{answers}})
const response=()=>{const res={status:vi.fn(),json:vi.fn()};res.status.mockReturnValue(res);return res}
afterEach(()=>vi.restoreAllMocks())
describe('Survey SJT preview transport',()=>{
  it('passes exact refusal and explicit null to per-kind semantic validation',async()=>{
    const simulate=vi.spyOn(service,'simulateSurveyDraft').mockResolvedValue({ok:true} as any)
    const answers={q1:{_surveyRefusal:true},q2:null,q3:['a','b'],q4:'a'},res=response(),next=vi.fn()
    await handler(request(answers),res,next)
    expect(simulate).toHaveBeenCalledWith('actor',expect.any(String),expect.any(String),answers,undefined)
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({code:0,data:{ok:true}}))
    expect(next).not.toHaveBeenCalled()
  })
  it('rejects arbitrary objects, extra refusal fields and false refusal without semantic execution',async()=>{
    const simulate=vi.spyOn(service,'simulateSurveyDraft').mockResolvedValue({ok:true} as any)
    for(const value of [{arbitrary:true},{_surveyRefusal:true,extra:'forged'},{_surveyRefusal:false}]){
      const res=response();await handler(request({q:value}),res,vi.fn());expect(res.status).toHaveBeenCalledWith(400)
    }
    expect(simulate).not.toHaveBeenCalled()
  })
})
