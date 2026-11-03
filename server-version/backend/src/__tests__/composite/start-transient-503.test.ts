import {Prisma} from '@prisma/client'
import {beforeEach,describe,expect,it,vi} from 'vitest'
const m=vi.hoisted(()=>({start:vi.fn(),restart:vi.fn()}))
vi.mock('../../modules/composite/composite.service',async orig=>({...(await orig() as object),startUserAttempt:m.start,restartUserAttempt:m.restart}))
import {compositeController} from '../../modules/composite/composite.controller'
import {AssessmentStartBusyError,classifyStartTransaction,rolledBackStartReason} from '../../modules/composite/start-transient'

const known=(code:string,message='raw internal detail: relation secret_table',meta?:Record<string,unknown>)=>
 new Prisma.PrismaClientKnownRequestError(message,{code,clientVersion:'5.22.0',meta})
const rolledBack=[
 ['P2028 maxWait',known('P2028','Transaction API error: Unable to start a transaction in the given time.'),'P2028'],
 ['P2028 expired',known('P2028','Transaction API error: Transaction already closed: A commit cannot be executed on an expired transaction. The timeout for this transaction was 5000 ms'),'P2028'],
 ['P2034',known('P2034','Transaction failed due to a write conflict or a deadlock'),'P2034'],
 ['raw 40001',known('P2010','Raw query failed. Code: `40001`',{code:'40001'}),'40001'],
 ['raw 40P01',known('P2010','Raw query failed. Code: `40P01`',{code:'40P01'}),'40P01'],
 ['raw 55P03',known('P2010','Raw query failed. Code: `55P03`',{code:'55P03'}),'55P03'],
 ['bare sqlstate',Object.assign(new Error('x'),{code:'40P01'}),'40P01'],
] as const
const notRolledBack=[
 ['P2028 other',known('P2028','Transaction API error: Transaction already closed: A query cannot be executed on a committed transaction.')],
 ['P2028 no message',Object.assign(new Error(''),{code:'P2028',message:undefined})],
 ['P2002',known('P2002','Unique constraint')],
 ['P2024 pool',known('P2024','Timed out fetching a new connection')],
 ['raw other',known('P2010','Raw query failed',{code:'23505'})],
 ['plain',new Error('boom')],
 ['null',null],
] as const
function fakeRes(){
 const res:any={headers:{} as Record<string,string>,statusCode:200,body:undefined}
 res.setHeader=(k:string,v:string)=>{res.headers[k]=v;return res}
 res.status=(s:number)=>{res.statusCode=s;return res}
 res.json=(b:unknown)=>{res.body=b;return res}
 return res
}
const req={user:{userId:'u1',role:'STUDENT'},params:{id:'c1',attemptId:'a1'},query:{},body:{}} as any

describe('START transient rollback classification',()=>{
 beforeEach(()=>{m.start.mockReset();m.restart.mockReset()})
 it.each(rolledBack)('%s is a known rollback',(_n,err,reason)=>{expect(rolledBackStartReason(err)).toBe(reason)})
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
 it('an unclassified P2028 keeps the generic 500 without leaking its message',async()=>{
  m.start.mockImplementation(()=>classifyStartTransaction(()=>Promise.reject(notRolledBack[0][1])))
  const res=fakeRes()
  await compositeController.startAttempt(req,res)
  expect(res.statusCode).toBe(500);expect(res.headers['Retry-After']).toBeUndefined()
  expect(res.body.message).toBe('服务器内部错误')
 })
})
