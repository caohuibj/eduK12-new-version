import {afterEach,describe,expect,it,vi} from 'vitest'
import type {NextFunction,Request,Response} from 'express'
import {surveyWavesRouter} from '../../modules/survey/waves.routes'
import * as publish from '../../modules/survey/waves.publish'
import {SurveyWaveError} from '../../modules/survey/waves.service'
import {assertSurveyDraft,SurveyDraftError,type Issue,type SjtDraft} from '../../modules/survey/builder.definition'
import {compileFrozenResearchUnit} from '../../modules/survey/publication.service'
import {errorHandler} from '../../middleware/errorHandler'

vi.mock('../../utils/logger',()=>({logger:{error:vi.fn(),warn:vi.fn(),info:vi.fn(),debug:vi.fn()}}))

// Route error translation only; current account/owner/transaction enforcement
// remains in the unchanged middleware/services and separate HTTP integration.
type Handler=(req:Request,res:Response,next:NextFunction)=>Promise<unknown>
type RouteLayer={route?:{path:string;stack:{handle:Handler}[]}}
const handler=(surveyWavesRouter as unknown as {stack:RouteLayer[]}).stack.find(layer=>
  layer.route?.path==='/:pid/waves/:wid/prepare')!.route!.stack[0].handle
const request=(body:unknown={revision:3})=>({user:{userId:'actor'},params:{
  pid:'11111111-1111-4111-8111-111111111111',wid:'22222222-2222-4222-8222-222222222222'},body}) as unknown as Request
const response=()=>{const res={status:vi.fn(),json:vi.fn()};res.status.mockReturnValue(res);return res}
const oneQuestionSjt: SjtDraft={schemaVersion:1,respondentType:'student_self_report',scenarioKey:'scene',title:'Scene',
  stimulus:'Synthetic scene',author:'Researcher',sourceNote:'Synthetic research content',licenseStatus:'self_authored',redistribution:'allowed',
  metrics:[{metricKey:'total',label:'Total',direction:'descriptive'}],
  questions:[{questionKey:'question',prompt:'Choose',options:[
    {optionKey:'a',label:'A',contributions:{total:1}},
    {optionKey:'b',label:'B',contributions:{total:2}},
  ]}]}
afterEach(()=>vi.restoreAllMocks())

describe('Survey wave prepare draft-validation transport',()=>{
  it('returns actionable 400 for a saved one-question SJT that cannot be frozen for publication',async()=>{
    // Saving an incomplete draft is legal; publication still uses the stricter
    // validator and must not fabricate a ready unit or disclose a generic 500.
    const saved=assertSurveyDraft('SJT',oneQuestionSjt)
    const prepare=vi.spyOn(publish,'prepareWave').mockImplementation(async()=>{
      compileFrozenResearchUnit({id:'draft',instrumentKey:'sjt',kind:'SJT',title:'SJT',revision:1,definition:saved})
      throw new Error('Invalid SJT unexpectedly compiled')
    })
    const res=response(),next=vi.fn()
    await handler(request(),res as unknown as Response,next)
    expect(prepare).toHaveBeenCalledWith('actor',expect.any(String),expect.any(String),3)
    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith({code:'SURVEY_DRAFT_INVALID',
      message:'questions：共享场景至少两道题目',
      data:{issues:[{path:'questions',message:'共享场景至少两道题目',severity:'error'}]}})
    expect(next).not.toHaveBeenCalled()
  })

  it('preserves structured issue paths while bounding the visible summary to five issues',async()=>{
    const issues:Issue[]=Array.from({length:6},(_,index)=>({path:'questions.'+index+'.options',message:'选项需修正',severity:'error'}))
    vi.spyOn(publish,'prepareWave').mockRejectedValue(new SurveyDraftError(issues))
    const res=response(),next=vi.fn()
    await handler(request(),res as unknown as Response,next)
    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith({code:'SURVEY_DRAFT_INVALID',
      message:issues.slice(0,5).map(issue=>issue.path+'：'+issue.message).join('；'),data:{issues}})
    expect(next).not.toHaveBeenCalled()
  })

  it.each([false,true])('keeps unknown internal errors on the redacted 500 path (spoofed name: %s)',async spoofed=>{
    const failure=new Error('private database or filesystem detail')
    if(spoofed)Object.assign(failure,{name:'SurveyDraftError',issues:[{path:'secret',message:'private detail'}]})
    vi.spyOn(publish,'prepareWave').mockRejectedValue(failure)
    const req=request(),res=response(),next=vi.fn()
    await handler(req,res as unknown as Response,next)
    expect(next).toHaveBeenCalledWith(failure)
    expect(res.status).not.toHaveBeenCalled();expect(res.json).not.toHaveBeenCalled()
    errorHandler(failure,req,res as unknown as Response,vi.fn())
    expect(res.status).toHaveBeenCalledWith(500)
    expect(res.json).toHaveBeenCalledWith({code:-1,message:'服务器内部错误',data:null})
  })

  it('retains revision conflicts as 409 rather than labeling them draft validation',async()=>{
    vi.spyOn(publish,'prepareWave').mockRejectedValue(new SurveyWaveError(409,'波次已经冻结或被其他编辑会话修改'))
    const res=response(),next=vi.fn()
    await handler(request(),res as unknown as Response,next)
    expect(res.status).toHaveBeenCalledWith(409)
    expect(res.json).toHaveBeenCalledWith({code:-1,message:'波次已经冻结或被其他编辑会话修改',data:null})
    expect(next).not.toHaveBeenCalled()
  })

  it('rejects malformed revision parameters before invoking publication',async()=>{
    const prepare=vi.spyOn(publish,'prepareWave'),res=response(),next=vi.fn()
    await handler(request({revision:-1}),res as unknown as Response,next)
    expect(res.status).toHaveBeenCalledWith(400)
    expect(prepare).not.toHaveBeenCalled();expect(next).not.toHaveBeenCalled()
  })

  it('preserves a successful frozen-publication response',async()=>{
    const value={publicationId:'publication',version:2,digest:'a'.repeat(64),waveId:'wave',runtimeReady:true as const}
    vi.spyOn(publish,'prepareWave').mockResolvedValue(value)
    const res=response(),next=vi.fn()
    await handler(request(),res as unknown as Response,next)
    expect(res.json).toHaveBeenCalledWith({code:0,message:'操作成功',data:value})
    expect(res.status).not.toHaveBeenCalled();expect(next).not.toHaveBeenCalled()
  })
})
