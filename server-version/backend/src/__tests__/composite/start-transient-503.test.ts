import {Prisma} from '@prisma/client'
import {beforeEach,describe,expect,it,vi} from 'vitest'
const m=vi.hoisted(()=>({start:vi.fn(),restart:vi.fn(),publicStart:vi.fn(),publicRestart:vi.fn()}))
vi.mock('../../modules/composite/composite.service',async orig=>({...(await orig() as object),startUserAttempt:m.start,restartUserAttempt:m.restart,startPublicAttempt:m.publicStart,restartPublicAttempt:m.publicRestart}))
import {compositeController} from '../../modules/composite/composite.controller'
import {InstrumentFinalSubmitError} from '../../services/instrumentFinalSubmit'
import {rethrowGateBusyAsStartBusy} from '../../modules/composite/start-transient'
import {BoundedAdmissionBusyError} from '../../services/boundedAdmissionGate'
import {AssessmentStartBusyError,classifyStartTransaction,rolledBackStartReason,START_INTERACTIVE_TRANSACTION} from '../../modules/composite/start-transient'

const known=(code:string,message='raw internal detail: relation secret_table',meta?:Record<string,unknown>)=>
 new Prisma.PrismaClientKnownRequestError(message,{code,clientVersion:'5.22.0',meta})
const rolledBack=[
 ['P2028 maxWait',known('P2028','Transaction API error: Unable to start a transaction in the given time.'),'P2028'],
 ['P2028 expired',known('P2028','Transaction API error: Transaction already closed: A commit cannot be executed on an expired transaction. The timeout for this transaction was 5000 ms'),'P2028'],
 ['P2034',known('P2034','Transaction failed due to a write conflict or a deadlock'),'P2034'],
 ['P2024 pool',known('P2024','Timed out fetching a new connection'),'P2024'],
 ['raw 40001',known('P2010','Raw query failed. Code: `40001`',{code:'40001'}),'40001'],
 ['raw 40P01',known('P2010','Raw query failed. Code: `40P01`',{code:'40P01'}),'40P01'],
 ['raw 55P03',known('P2010','Raw query failed. Code: `55P03`',{code:'55P03'}),'55P03'],
 ['bare sqlstate',Object.assign(new Error('x'),{code:'40P01'}),'40P01'],
] as const
const notRolledBack=[
 ['P2002',known('P2002','Unique constraint')],
 ['raw other',known('P2010','Raw query failed',{code:'23505'})],
 ['plain',new Error('boom')],
 ['null',null],
] as const
const ambiguousTransactions=[
 ['P2028 not found',known('P2028','Transaction not found. Transaction API error: Transaction not found.')],
 ['P2028 other API',known('P2028','Transaction API error: Transaction already closed: A query cannot be executed on a committed transaction.')],
 ['P2028 no message',Object.assign(new Error(''),{code:'P2028',message:undefined})],
 ['wrapped not found',Object.assign(new Error('Transaction not found'),{code:'UNKNOWN'})],
 ['wrapped API error',new Error('Transaction API error: retry exhausted')],
] as const
function fakeRes(){
 const res:any={headers:{} as Record<string,string>,statusCode:200,body:undefined}
 res.setHeader=(k:string,v:string)=>{res.headers[k]=v;return res}
 res.status=(s:number)=>{res.statusCode=s;return res}
 res.json=(b:unknown)=>{res.body=b;return res}
 return res
}
const req={user:{userId:'u1',role:'STUDENT'},params:{id:'c1',attemptId:'a1'},query:{},body:{}} as any

describe('gate-busy wiring (queue_full / timeout -> 503 contract)',()=>{
 const gateBusy=(reason:'queue_full'|'timeout')=>new BoundedAdmissionBusyError({gate:'training_start_admission',reason,retryAfterSeconds:1,code:'ASSESSMENT_START_BUSY'})
 const fakeRes=()=>{const res:any={headers:{},statusCode:200};res.setHeader=(k:string,v:string)=>{res.headers[k]=v;return res};res.status=(s:number)=>{res.statusCode=s;return res};res.json=(b:unknown)=>{res.body=b;return res};return res}
 it.each([['queue_full','ADMISSION_QUEUE_FULL','queue_full'],['timeout','ADMISSION_WAIT_TIMEOUT','queue_timeout']])('%s maps to the safe-retry 503',(reason,expectedReason,expectedClass)=>{
  const busyError=gateBusy(reason as 'queue_full'|'timeout')
  let converted:unknown
  try{rethrowGateBusyAsStartBusy(busyError)}catch(e){converted=e}
  expect(converted).toBeInstanceOf(AssessmentStartBusyError)
  const busy=converted as AssessmentStartBusyError
  expect(busy.reason).toBe(expectedReason)
  expect(busy.retryAfterSeconds).toBe(1)
  expect(busy.diagnosticClass).toBe(expectedClass)
 })
 it('non-gate errors pass through untouched',()=>{
  const other=new Error('boom')
  expect(rethrowGateBusyAsStartBusy(other)).toBe(other)
 })
 it('a gate-busy START reaches the controller as 503 with Retry-After and a safe body',async()=>{
  const busyError=gateBusy('queue_full')
  m.start.mockImplementation(()=>Promise.reject(rethrowGateBusyAsStartBusy(busyError)))
  const res=fakeRes()
  await compositeController.startAttempt(req,res)
  expect(res.statusCode).toBe(503)
  expect(res.headers['Retry-After']).toBe('1')
  expect(res.body).toEqual({code:'ASSESSMENT_START_BUSY',message:'综合测评开始请求繁忙，请稍后重试',data:null})
  expect(JSON.stringify(res.body)).not.toMatch(/bounded|queue|pool|training_start/)
 })
})
describe('START transient rollback classification',()=>{
 beforeEach(()=>{m.start.mockReset();m.restart.mockReset();m.publicStart.mockReset();m.publicRestart.mockReset()})
 it('returns resource protection as a retryable 503 for authenticated START',async()=>{
  const message='系统繁忙，请稍后开始测评；已经提交的答案不受影响。'
  m.start.mockRejectedValue(new InstrumentFinalSubmitError('INSTRUMENT_NOT_AVAILABLE',message,503))
  const res=fakeRes()
  await compositeController.startAttempt(req,res)
  expect(res.statusCode).toBe(503)
  expect(res.headers['Retry-After']).toBe('30')
  expect(res.body).toEqual({code:'INSTRUMENT_NOT_AVAILABLE',message,data:null})
  expect(m.start).toHaveBeenCalledTimes(1)
 })
 it('returns the same protection response for authenticated RESTART and public START/RESTART',async()=>{
  const message='系统繁忙，请稍后开始测评；已经提交的答案不受影响。'
  m.restart.mockRejectedValue(new InstrumentFinalSubmitError('INSTRUMENT_NOT_AVAILABLE',message,503))
  m.publicStart.mockRejectedValue(new InstrumentFinalSubmitError('INSTRUMENT_NOT_AVAILABLE',message,503))
  m.publicRestart.mockRejectedValue(new InstrumentFinalSubmitError('INSTRUMENT_NOT_AVAILABLE',message,503))
  const restartRes=fakeRes(),publicRes=fakeRes(),publicRestartRes=fakeRes()
  await compositeController.restartAttempt(req,restartRes)
  await compositeController.publicStart({params:{token:'synthetic'},query:{},body:{}} as any,publicRes)
  await compositeController.publicRestart({params:{attemptId:'a1'},headers:{'x-recovery-token':'a'.repeat(24)}} as any,publicRestartRes)
  for(const res of [restartRes,publicRes,publicRestartRes]){
   expect(res.statusCode).toBe(503)
   expect(res.headers['Retry-After']).toBe('30')
   expect(res.body).toEqual({code:'INSTRUMENT_NOT_AVAILABLE',message,data:null})
  }
 })
 it('does not treat other unavailable statuses or unrelated 503 errors as resource protection',async()=>{
  const res404=fakeRes(),resUnknown=fakeRes()
  m.start.mockRejectedValueOnce(new InstrumentFinalSubmitError('INSTRUMENT_NOT_AVAILABLE','不可用',404))
   .mockRejectedValueOnce(Object.assign(new Error('internal detail'),{statusCode:503}))
  await compositeController.startAttempt(req,res404)
  await compositeController.startAttempt(req,resUnknown)
  expect(res404.statusCode).toBe(404)
  expect(res404.headers['Retry-After']).toBeUndefined()
  expect(resUnknown.statusCode).toBe(500)
  expect(resUnknown.headers['Retry-After']).toBeUndefined()
  expect(resUnknown.body.message).toBe('服务器内部错误')
 })
 it('START interactive transaction uses 10s maxWait and 15s timeout',()=>{expect(START_INTERACTIVE_TRANSACTION).toEqual({maxWait:10_000,timeout:15_000})})
 it.each(rolledBack)('%s is a known rollback',(_n,err,reason)=>{expect(rolledBackStartReason(err)).toBe(reason)})
 it.each(ambiguousTransactions)('%s retains its unknown commit outcome',async(_n,err)=>{
  expect(rolledBackStartReason(err)).toBeNull()
  await expect(classifyStartTransaction(()=>Promise.reject(err))).rejects.toBe(err)
 })
 it.each(notRolledBack)('%s is not reclassified',(_n,err)=>{expect(rolledBackStartReason(err)).toBeNull()})
 it('wraps exactly one attempt and never retries',async()=>{
  const run=vi.fn().mockRejectedValue(rolledBack[0][1])
  await expect(classifyStartTransaction(run)).rejects.toBeInstanceOf(AssessmentStartBusyError)
  expect(run).toHaveBeenCalledTimes(1)
  const other=new Error('boom')
  await expect(classifyStartTransaction(()=>Promise.reject(other))).rejects.toBe(other)
  await expect(classifyStartTransaction(async()=>42)).resolves.toBe(42)
 })
 it.each(rolledBack)('START %s -> 503 ASSESSMENT_START_BUSY with Retry-After and no internal message',async(_n,err)=>{
  m.start.mockImplementation(()=>classifyStartTransaction(()=>Promise.reject(err)))
  const res=fakeRes()
  await compositeController.startAttempt(req,res)
  expect(res.statusCode).toBe(503)
  expect(res.headers['Retry-After']).toBe('1')
  expect(res.body).toEqual({code:'ASSESSMENT_START_BUSY',message:'综合测评开始请求繁忙，请稍后重试',data:null})
  expect(JSON.stringify(res.body)).not.toMatch(/secret_table|Raw query|Transaction API/)
  expect(m.start).toHaveBeenCalledTimes(1)
 })
 it('RESTART uses the same mapping',async()=>{
  m.restart.mockImplementation(()=>classifyStartTransaction(()=>Promise.reject(rolledBack[2][1])))
  const res=fakeRes()
  await compositeController.restartAttempt(req,res)
  expect(res.statusCode).toBe(503);expect(res.body.code).toBe('ASSESSMENT_START_BUSY')
 })
 it.each(ambiguousTransactions)('%s is not advertised as safe START retry',async(_n,err)=>{
  m.start.mockImplementation(()=>classifyStartTransaction(()=>Promise.reject(err)))
  const res=fakeRes()
  await compositeController.startAttempt(req,res)
  expect(res.statusCode).toBe(500)
  expect(res.headers['Retry-After']).toBeUndefined()
  expect(res.body.message).toBe('服务器内部错误')
 })
 it('accepts the explicit engine rollback reason carried in Prisma meta',()=>{
  expect(rolledBackStartReason(known('P2028','Transaction API error',{error:'Transaction already closed: A query cannot be executed on an expired transaction.'}))).toBe('P2028')
 })
 it('a unique-constraint error is not remapped to START busy',async()=>{
  m.start.mockImplementation(()=>classifyStartTransaction(()=>Promise.reject(notRolledBack[0][1])))
  const res=fakeRes()
  await compositeController.startAttempt(req,res)
  expect(res.statusCode).toBe(500);expect(res.headers['Retry-After']).toBeUndefined()
  expect(res.body.message).toBe('服务器内部错误')
 })
})
