import {afterEach,describe,expect,it,vi} from 'vitest'
import {publicSurveyRouter} from '../../modules/survey/public.routes'
import {surveyCognitiveRouter} from '../../modules/survey/cognitive.public.routes'
import teacherFormRouter from '../../modules/huiteacher/formRuntime.routes'
import * as survey from '../../modules/survey/final.service'
import * as cognitive from '../../modules/survey/cognitive.service'
import * as teacher from '../../modules/huiteacher/formFinal.service'
import {errorHandler} from '../../middleware/errorHandler'
import {toCompletionAdmissionBusyError} from '../../services/questionnaireCompletionAdmission'
vi.mock('../../utils/logger',()=>({logger:{error:vi.fn(),warn:vi.fn(),info:vi.fn(),debug:vi.fn()}}))
const id='11111111-1111-4111-8111-111111111111'
const cases=[
 {name:'Survey parent FINAL',router:publicSurveyRouter,path:'/r/:publicId/attempts/:attemptId/final',module:survey,method:'submitResearchFinal',body:{accessCredential:'a'.repeat(43),submissionId:id,answers:{}}},
 {name:'Survey cognitive FINAL',router:surveyCognitiveRouter,path:'/:slotKey/:sessionId/final',module:cognitive,method:'submitSurveyCognitiveFinal',body:{accessCredential:'a'.repeat(43),submissionId:id,attemptEpoch:1,definitionHash:'a'.repeat(64),trials:Array.from({length:120},()=>({})),administrationProvenance:{schemaVersion:1,deviceClass:'DESKTOP_LAPTOP',administrationMode:'KEYBOARD_MOUSE'}}},
 {name:'Teacher Form FINAL',router:teacherFormRouter,path:'/form-attempts/:attemptId/final',module:teacher,method:'submitOwnHuiteacherFormFinal',body:{submissionId:id,answers:{}}},
]
async function invoke(c:typeof cases[number],failure:unknown){
 vi.spyOn(c.module as any,c.method).mockRejectedValue(failure)
 const route=(c.router as any).stack.find((layer:any)=>layer.route?.path===c.path).route
 const handler=route.stack.at(-1).handle
 const req:any={user:{userId:id},params:{publicId:id,attemptId:id,sessionId:id,slotKey:'go'},body:c.body}
 const res:any={status:vi.fn(),json:vi.fn(),setHeader:vi.fn()};res.status.mockReturnValue(res)
 await new Promise<void>((resolve,reject)=>{
  const next=(err:any)=>{try{errorHandler(err,req,res,vi.fn());resolve()}catch(e){reject(e)}}
  Promise.resolve(handler(req,res,next)).catch(reject)
 })
 return res
}
afterEach(()=>vi.restoreAllMocks())
// Exercise actual endpoint wrappers and final error middleware, injecting only
// the service failure. Authentication/DB behavior is covered by isolated HTTP/PG.
describe.each(cases)('$name retryable completion error transport',c=>{
 it.each(['P2024','P2034','40001'])('returns 503 with Retry-After for classified %s without exposing internals',async code=>{
  const classified=toCompletionAdmissionBusyError({code,message:'private DB detail'},2)
  const res=await invoke(c,classified)
  expect(res.status).toHaveBeenCalledWith(503);expect(res.setHeader).toHaveBeenCalledWith('Retry-After','2')
  expect(res.json).toHaveBeenCalledWith({code:'COMPLETION_BUSY',message:'测评完成请求繁忙，请稍后重试',data:null})
 })
 it('keeps an unknown failure redacted and does not advertise retries',async()=>{
  const res=await invoke(c,Object.assign(new Error('private DB detail'),{code:'UNEXPECTED_BUSY'}))
  expect(res.status).toHaveBeenCalledWith(500);expect(res.setHeader).not.toHaveBeenCalled()
  expect(res.json).toHaveBeenCalledWith({code:-1,message:'服务器内部错误',data:null})
 })
})
describe('only the classified completion code is retryable',()=>{
 it.each([undefined,NaN,Infinity,-1,0])('sanitizes malformed retry delay %s',retryAfterSeconds=>{
  const res:any={status:vi.fn(),json:vi.fn(),setHeader:vi.fn()};res.status.mockReturnValue(res)
  errorHandler({code:'COMPLETION_BUSY',retryAfterSeconds,message:'private detail'},{} as any,res,vi.fn())
  expect(res.status).toHaveBeenCalledWith(503);expect(res.setHeader).toHaveBeenCalledWith('Retry-After','1')
 })
 it('does not turn unclassified database errors into retryable responses',()=>{
  const res:any={status:vi.fn(),json:vi.fn(),setHeader:vi.fn()};res.status.mockReturnValue(res)
  errorHandler({code:'P2024',message:'private detail'},{} as any,res,vi.fn())
  expect(res.status).toHaveBeenCalledWith(500);expect(res.setHeader).not.toHaveBeenCalled()
 })
})
