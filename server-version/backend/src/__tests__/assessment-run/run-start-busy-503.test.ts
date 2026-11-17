import {beforeEach,describe,expect,it,vi} from 'vitest'
const m=vi.hoisted(()=>({start:vi.fn(),parent:vi.fn(),getAttemptState:vi.fn(),campusAccess:vi.fn(),wholeDelivery:vi.fn()}))
vi.mock('../../modules/assessment-run/startExecution',()=>({startAssessmentRunExecution:m.start}))
vi.mock('../../modules/composite/composite.service',()=>({getAttemptState:m.getAttemptState}))
vi.mock('../../modules/composite/whole-questionnaire.service',()=>({getWholeQuestionnaireDelivery:m.wholeDelivery,getWholeQuestionnaireDefinition:vi.fn()}))
vi.mock('../../modules/campus/campus-composite-authority',()=>({checkCampusCompositeAccessAuthority:m.campusAccess}))
vi.mock('../../modules/assessment-run/resourceBoundary',()=>({
  assertRunExecutionParent:m.parent,
  assertCurrentRunManagerBoundary:vi.fn(),
  assertCurrentRunPublisherBoundary:vi.fn(),
}))
import {Prisma} from '@prisma/client'
import {assessmentRunController as runController} from '../../modules/assessment-run/run.controller'
import {errorHandler} from '../../middleware/errorHandler'
import {AssessmentStartBusyError,classifyStartTransaction} from '../../modules/composite/start-transient'
import {InstrumentFinalSubmitError} from '../../services/instrumentFinalSubmit'
import {logger} from '../../utils/logger'

function fakeRes(){
  const res:any={headers:{} as Record<string,string>,statusCode:200,body:undefined}
  res.setHeader=(k:string,v:string)=>{res.headers[k]=v;return res}
  res.status=(s:number)=>{res.statusCode=s;return res}
  res.json=(b:unknown)=>{res.body=b;return res}
  return res
}
const req={
  user:{userId:'student-1',role:'STUDENT'},
  params:{organizationId:'org-1',runId:'run-1',executionId:'exec-1'},
  query:{},body:{},
} as any

describe('Run START transient rollback → 503 ASSESSMENT_START_BUSY',()=>{
  beforeEach(()=>{m.start.mockReset();m.parent.mockReset();m.parent.mockResolvedValue(undefined);
    m.getAttemptState.mockReset();
    m.campusAccess.mockReset();m.campusAccess.mockResolvedValue(true);
    vi.spyOn(logger,'error').mockImplementation(()=>{});
    vi.spyOn(logger,'info').mockImplementation(()=>{});
    vi.spyOn(logger,'warn').mockImplementation(()=>{})})

  it('run.controller START maps a rolled-back transaction to 503 with Retry-After',async()=>{
    m.start.mockRejectedValue(new AssessmentStartBusyError('P2028'))
    const res=fakeRes()
    await runController.startExecution(req,res)
    expect(res.statusCode).toBe(503)
    expect(res.headers['Retry-After']).toBe('1')
    expect(res.body).toEqual({code:'ASSESSMENT_START_BUSY',message:'综合测评开始请求繁忙，请稍后重试',data:null})
    expect(m.start).toHaveBeenCalledTimes(1)
  })

  it('run.controller START maps a raw P2024 pool timeout to 503 with Retry-After',async()=>{
    // The P2024 surfaces from the claim/dispatch transaction before BEGIN, so the
    // classifier reclassifies it as a safe-retry 503 instead of a generic 500.
    const p2024=new Prisma.PrismaClientKnownRequestError('Timed out fetching a new connection',{code:'P2024',clientVersion:'5.22.0'})
    m.start.mockImplementation(()=>classifyStartTransaction(()=>Promise.reject(p2024)))
    const res=fakeRes()
    await runController.startExecution(req,res)
    expect(res.statusCode).toBe(503)
    expect(res.headers['Retry-After']).toBe('1')
    expect(res.body).toEqual({code:'ASSESSMENT_START_BUSY',message:'综合测评开始请求繁忙，请稍后重试',data:null})
    expect(m.start).toHaveBeenCalledTimes(1)
  })

  it('run.controller keeps rethrowing unclassified errors for the global handler',async()=>{
    const other=new Error('boom')
    m.start.mockRejectedValue(other)
    await expect(runController.startExecution(req,fakeRes())).rejects.toBe(other)
  })

  it('the global error handler maps ASSESSMENT_START_BUSY to 503 with Retry-After',()=>{
    const res=fakeRes()
    errorHandler(new AssessmentStartBusyError('40P01'),req,res as never,vi.fn())
    expect(res.statusCode).toBe(503)
    expect(res.headers['Retry-After']).toBe('1')
    expect(res.body).toEqual({code:'ASSESSMENT_START_BUSY',message:'综合测评开始请求繁忙，请稍后重试',data:null})
  })

  it('the global error handler keeps an unclassified P2028 at the generic 500',()=>{
    const res=fakeRes()
    const prismaLike=Object.assign(new Error('Transaction API error: Transaction already closed: A query cannot be executed on a committed transaction.'),{code:'P2028'})
    errorHandler(prismaLike,req,res as never,vi.fn())
    expect(res.statusCode).toBe(500)
    expect(res.headers['Retry-After']).toBeUndefined()
    expect(res.body.message).toBe('服务器内部错误')
  })

  it('attaches inline currentUnit when requested by body.delivery === "inline"',async()=>{
    m.start.mockResolvedValue({state:'STARTED',runtimeBindingKind:'COMPOSITE',runtimeBindingRef:'attempt-1',replayed:false})
    m.getAttemptState.mockResolvedValue({id:'attempt-1',deliveryMode:'FINAL_ONLY',status:'IN_PROGRESS',currentItem:{id:'scale-1',type:'SCALE'}})
    const res=fakeRes()
    await runController.startExecution({...req,body:{delivery:'inline'},query:{}},res)
    expect(res.statusCode).toBe(200)
    expect(res.body.data.currentUnit).toEqual({id:'attempt-1',deliveryMode:'FINAL_ONLY',status:'IN_PROGRESS',currentItem:{id:'scale-1',type:'SCALE'}})
    expect(m.getAttemptState).toHaveBeenCalledWith('attempt-1',{userId:'student-1'},undefined,'current-unit')
  })

  it('attaches inline currentUnit when requested by query.view === "current-unit"',async()=>{
    m.start.mockResolvedValue({state:'STARTED',runtimeBindingKind:'COMPOSITE',runtimeBindingRef:'attempt-2',replayed:false})
    m.getAttemptState.mockResolvedValue({id:'attempt-2',deliveryMode:'FINAL_ONLY',status:'IN_PROGRESS',currentItem:{id:'form-1',type:'FORM_SECTION'}})
    const res=fakeRes()
    await runController.startExecution({...req,body:{},query:{view:'current-unit'}},res)
    expect(res.statusCode).toBe(200)
    expect(res.body.data.currentUnit).toEqual({id:'attempt-2',deliveryMode:'FINAL_ONLY',status:'IN_PROGRESS',currentItem:{id:'form-1',type:'FORM_SECTION'}})
    expect(m.getAttemptState).toHaveBeenCalledWith('attempt-2',{userId:'student-1'},undefined,'current-unit')
  })

  it('safely omits currentUnit if getAttemptState fails without failing the committed START',async()=>{
    m.start.mockResolvedValue({state:'STARTED',runtimeBindingKind:'COMPOSITE',runtimeBindingRef:'attempt-3',replayed:false})
    m.getAttemptState.mockRejectedValue(new Error('transient projection error'))
    const res=fakeRes()
    await runController.startExecution({...req,body:{delivery:'inline'},query:{}},res)
    expect(res.statusCode).toBe(200)
    expect(res.body.data.currentUnit).toBeUndefined()
    expect(res.body.data.state).toBe('STARTED')
    expect(res.body.data.runtimeBindingRef).toBe('attempt-3')
  })

  it('does not attach currentUnit when delivery is not requested',async()=>{
    m.start.mockResolvedValue({state:'STARTED',runtimeBindingKind:'COMPOSITE',runtimeBindingRef:'attempt-4',replayed:false})
    const res=fakeRes()
    await runController.startExecution({...req,body:{},query:{}},res)
    expect(res.statusCode).toBe(200)
    expect(res.body.data.currentUnit).toBeUndefined()
    expect(m.getAttemptState).not.toHaveBeenCalled()
  })

  it('omits currentUnit when campus composite access authority is revoked for SCHOOL user',async()=>{
    m.start.mockResolvedValue({state:'STARTED',runtimeBindingKind:'COMPOSITE',runtimeBindingRef:'attempt-revoked',replayed:true})
    m.campusAccess.mockResolvedValue(false)
    const schoolReq={...req,user:{userId:'student-revoked',role:'STUDENT',accountDomain:'SCHOOL'},body:{delivery:'inline'}}
    const res=fakeRes()
    await runController.startExecution(schoolReq,res)
    expect(res.statusCode).toBe(200)
    expect(res.body.data.state).toBe('STARTED')
    expect(res.body.data.currentUnit).toBeUndefined()
    expect(m.campusAccess).toHaveBeenCalledWith({attemptId:'attempt-revoked',userId:'student-revoked'})
    expect(m.getAttemptState).not.toHaveBeenCalled()
  })

  it('delivers currentUnit when campus composite access authority is valid for SCHOOL user',async()=>{
    m.start.mockResolvedValue({state:'STARTED',runtimeBindingKind:'COMPOSITE',runtimeBindingRef:'attempt-valid',replayed:true})
    m.campusAccess.mockResolvedValue(true)
    m.getAttemptState.mockResolvedValue({id:'attempt-valid',deliveryMode:'FINAL_ONLY',status:'IN_PROGRESS'})
    const schoolReq={...req,user:{userId:'student-valid',role:'STUDENT',accountDomain:'SCHOOL'},body:{delivery:'inline'}}
    const res=fakeRes()
    await runController.startExecution(schoolReq,res)
    expect(res.statusCode).toBe(200)
    expect(res.body.data.state).toBe('STARTED')
    expect(res.body.data.currentUnit).toEqual({id:'attempt-valid',deliveryMode:'FINAL_ONLY',status:'IN_PROGRESS'})
    expect(m.campusAccess).toHaveBeenCalledWith({attemptId:'attempt-valid',userId:'student-valid'})
    expect(m.getAttemptState).toHaveBeenCalledWith('attempt-valid',{userId:'student-valid'},undefined,'current-unit')
  })

  it('maps resource-gate 503 to HTTP 503 with preferred Retry-After',async()=>{
    const resourceErr=new InstrumentFinalSubmitError('INSTRUMENT_NOT_AVAILABLE','系统繁忙，请稍后开始测评；已经提交的答案不受影响。',503)
    ;(resourceErr as {preferredRetryAfterSeconds?:number}).preferredRetryAfterSeconds=10
    m.start.mockRejectedValue(resourceErr)
    const res=fakeRes()
    await runController.startExecution(req,res)
    expect(res.statusCode).toBe(503)
    expect(res.headers['Retry-After']).toBe('10')
    expect(res.body).toEqual({code:'INSTRUMENT_NOT_AVAILABLE',message:'系统繁忙，请稍后开始测评；已经提交的答案不受影响。',data:null})
  })

  it('passes the existing School parent query to pre-gate admission without a second read',async()=>{
    const preflight={runtimeBindingKind:null,runtimeBindingRef:null,respondentUserId:'student-1'}
    m.parent.mockResolvedValue(preflight)
    m.start.mockRejectedValue(new AssessmentStartBusyError('ADMISSION_QUEUE_FULL'))
    await runController.startExecution(req,fakeRes())
    expect(m.start).toHaveBeenCalledWith({executionId:'exec-1',actorUserId:'student-1',startPreflight:preflight})
  })

  it('keeps recovered Whole attempts non-fresh even when Run START returns replayed:false',async()=>{
    m.start.mockResolvedValue({state:'STARTED',runtimeBindingKind:'COMPOSITE',runtimeBindingRef:'attempt-recovered',replayed:false})
    m.getAttemptState.mockResolvedValue({id:'attempt-recovered',deliveryMode:'FINAL_ONLY',status:'IN_PROGRESS',executionMode:'WHOLE_LOCAL'})
    const res=fakeRes()
    await runController.startExecution({...req,body:{delivery:'inline'}},res)
    expect(res.statusCode).toBe(200)
    expect(res.body.data.freshlyCreated).toBe(false)
    expect(res.body.data.runtimeBindingRef).toBe('attempt-recovered')
  })

  it('reuses _educationWholePreload and attaches freshlyCreated + wholeBinding for WHOLE_LOCAL START',async()=>{
    const templateHash='a'.repeat(64)
    const preloadedParent={id:'attempt-whole'}
    const preloadedState={snapshots:[],scaleChildById:new Map(),skipCurrentUnitActivation:true}
    const startedResult={state:'STARTED',runtimeBindingKind:'COMPOSITE',runtimeBindingRef:'attempt-whole',replayed:false}
    Object.defineProperty(startedResult,'_educationWholePreload',{value:{parent:preloadedParent,preloadedState}})
    Object.defineProperty(startedResult,'_freshlyCreatedAttempt',{value:true})
    m.start.mockResolvedValue(startedResult)
    m.getAttemptState.mockResolvedValue({id:'attempt-whole',deliveryMode:'FINAL_ONLY',status:'IN_PROGRESS',executionMode:'WHOLE_LOCAL',currentItem:null})
    m.wholeDelivery.mockResolvedValue({mode:'binding',binding:{attemptId:'attempt-whole',attemptEpoch:1,slotSetHash:'b'.repeat(64),contextSnapshotHash:null,templateHash,units:[]}})

    const res=fakeRes()
    await runController.startExecution({...req,body:{delivery:'inline'},query:{knownTemplateHash:templateHash}},res)
    expect(res.statusCode).toBe(200)
    expect(m.getAttemptState).toHaveBeenCalledWith('attempt-whole',{userId:'student-1'},undefined,'current-unit',preloadedParent,preloadedState)
    expect(m.wholeDelivery).toHaveBeenCalledWith('attempt-whole',{userId:'student-1'},{preloaded:preloadedParent,knownTemplateHashes:new Set([templateHash])})
    expect(res.body.data).toMatchObject({
      state:'STARTED',
      runtimeBindingRef:'attempt-whole',
      freshlyCreated:true,
      wholeBinding:{attemptId:'attempt-whole',templateHash},
    })
  })
})

