import {beforeEach,describe,expect,it,vi} from 'vitest'
const m=vi.hoisted(()=>({start:vi.fn(),parent:vi.fn()}))
vi.mock('../../modules/assessment-run/startExecution',()=>({startAssessmentRunExecution:m.start}))
vi.mock('../../modules/assessment-run/resourceBoundary',()=>({
  assertRunExecutionParent:m.parent,
  assertCurrentRunManagerBoundary:vi.fn(),
  assertCurrentRunPublisherBoundary:vi.fn(),
}))
import {Prisma} from '@prisma/client'
import {assessmentRunController as runController} from '../../modules/assessment-run/run.controller'
import {errorHandler} from '../../middleware/errorHandler'
import {AssessmentStartBusyError,classifyStartTransaction} from '../../modules/composite/start-transient'
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
    vi.spyOn(logger,'error').mockImplementation(()=>{})})

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
})
