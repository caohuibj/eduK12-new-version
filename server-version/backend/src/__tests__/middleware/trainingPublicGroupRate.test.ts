import express from 'express'
import {once} from 'node:events'
import {describe,it,expect,vi,afterEach} from 'vitest'
import type {Request,Response} from 'express'
vi.mock('../../config/database',()=>({prisma:{$queryRaw:vi.fn()}}))
vi.mock('../../services/cacheService',()=>({cacheService:{getRateLimitState:vi.fn(),consumeRateLimit:vi.fn()}}))
import {cacheService} from '../../services/cacheService'
import {createBudgetLimiter} from '../../middleware/publicAssessmentRateLimit'
import {prisma} from '../../config/database'
import {BoundedAdmissionGate} from '../../services/boundedAdmissionGate'
import {trainingGroupRateScope,lookupTrainingGroupRateScope,createTrainingGroupIpResolver,admitTrainingGroupLookup,recordTrainingGroupLookupFailure,TRAINING_GROUP_FAILED_LOOKUPS_PER_MINUTE} from '../../middleware/trainingPublicGroupRate'
const id='10000000-0000-4000-8000-000000000001',token='a'.repeat(32),recovery='b'.repeat(32)
const request=(path='/'+token,method='GET',extra:any={})=>({baseUrl:'/api/public/composite-assessments',path,method,headers:{},body:{},...extra}) as Request
const response=()=>{const r={headersSent:false,writableEnded:false,destroyed:false,status:vi.fn(),json:vi.fn(),setHeader:vi.fn()};r.status.mockReturnValue(r);return r as unknown as Response&typeof r}
afterEach(()=>{vi.clearAllMocks();vi.unstubAllEnvs()})
describe('Training opt-in IP budget only',()=>{
 it('does not query malformed proofs, hints, login/account or unknown paths',async()=>{
  const lookup=vi.fn(async()=>true),reject=vi.fn(),run=createTrainingGroupIpResolver({lookup,reject}),next=vi.fn()
  for(const req of [request('/not-token'),request('/attempts/'+id),request('/login','POST'),request('/'+token,'GET',{baseUrl:'/api/auth'}),
    request('/attempts/'+id+'/save','POST',{body:{recoveryToken:recovery}}),request('/attempts/'+id+'/arbitrary','POST',{body:{recoveryToken:recovery}}),
    request('/'+token+'/start','DELETE'),request('/unknown','GET',{query:{round:id,groupIp:true}})])await run(req,response(),next)
  expect(lookup).not.toHaveBeenCalled();expect(next).not.toHaveBeenCalled();expect(reject).toHaveBeenCalledTimes(8)
 })
 it('entry and recovery are distinct; hints cannot change actual target',()=>{
  expect(trainingGroupRateScope(request('/'+token+'/start','POST'))).toEqual({tokenHash:expect.any(String)})
  const req=request('/attempts/'+id+'/whole/submit','POST',{headers:{'x-recovery-token':recovery},query:{round:'other'}})
  expect(trainingGroupRateScope(req)).toEqual({attemptId:id,recoveryHash:expect.any(String)})
  expect(JSON.stringify(trainingGroupRateScope(req))).not.toContain(recovery)
  expect(trainingGroupRateScope(request('/sessions/'+id+'/submit','POST',{baseUrl:'/api/public/cognitive',body:{recoveryToken:recovery}}))).toEqual({sessionId:id,recoveryHash:expect.any(String)})
 })
 it('valid candidates never consume failure budget or cache a grant',async()=>{
  const req=request(),next=vi.fn(),reject=vi.fn(),recordFailure=vi.fn(),lookup=vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false),run=createTrainingGroupIpResolver({lookup,reject,recordFailure})
  await run(req,response(),next);expect(recordFailure).not.toHaveBeenCalled();expect(next).toHaveBeenCalledTimes(1)
  await run(req,response(),next);expect(recordFailure).toHaveBeenCalledTimes(1);expect(reject).toHaveBeenCalledTimes(1)
  expect(lookup).toHaveBeenCalledTimes(2)
 })
 it('ordinary below-coarse requests run zero policy SQL and valid exceptions pass beyond coarse budget',async()=>{
  const app=express(),lookup=vi.fn(async()=>true),recordFailure=vi.fn(),resolver=createTrainingGroupIpResolver({lookup,recordFailure})
  app.use('/api/public/composite-assessments',createBudgetLimiter({name:'c21-test-coarse',budget:'get',limit:1,key:()=> 'same-ip',onExceeded:resolver}),(req,res)=>res.json({ok:true}))
  const server=app.listen(0,'127.0.0.1');await once(server,'listening')
  try{
   const port=(server.address() as any).port,url=`http://127.0.0.1:${port}/api/public/composite-assessments/${token}`
   expect((await fetch(url)).status).toBe(200);expect(lookup).not.toHaveBeenCalled()
   for(let i=0;i<5;i++)expect((await fetch(url)).status).toBe(200)
   expect(lookup).toHaveBeenCalledTimes(5);expect(recordFailure).not.toHaveBeenCalled()
   lookup.mockResolvedValue(false);expect((await fetch(url)).status).toBe(429)
   expect(recordFailure).toHaveBeenCalledTimes(1)
  }finally{server.close();await once(server,'close')}
 })
 it('negative candidates are bounded while successful candidates have no failure charge',async()=>{
  const req=request('/'+token,'GET',{ip:'192.0.2.123'}),lookup=vi.fn(async()=>false),run=createTrainingGroupIpResolver({lookup})
  for(let i=0;i<TRAINING_GROUP_FAILED_LOOKUPS_PER_MINUTE+5;i++)await run(req,response(),vi.fn())
  expect(lookup).toHaveBeenCalledTimes(TRAINING_GROUP_FAILED_LOOKUPS_PER_MINUTE)
  expect(await admitTrainingGroupLookup(req)).toBe(false)
 })
 it('production failure budget uses shared state and fails closed on Redis errors',async()=>{
  vi.stubEnv('NODE_ENV','production')
  vi.mocked(cacheService.getRateLimitState).mockResolvedValue({count:120,retryAfterSeconds:30})
  expect(await admitTrainingGroupLookup(request())).toBe(false)
  vi.mocked(cacheService.getRateLimitState).mockResolvedValue(null)
  await expect(admitTrainingGroupLookup(request())).rejects.toThrow()
  vi.mocked(cacheService.consumeRateLimit).mockResolvedValue(null)
  await expect(recordTrainingGroupLookupFailure(request())).rejects.toThrow()
 })
 it('queued requests recheck negative budget immediately before SQL',async()=>{
  const gate=new BoundedAdmissionGate({name:'training_negative_recheck',maxConcurrent:1,maxQueue:2,maxWaitMs:500})
  let release!:(v:boolean)=>void,count=0
  const lookup=vi.fn(()=>new Promise<boolean>(r=>{release=r})),admit=vi.fn(async()=>count===0),recordFailure=vi.fn(async()=>{count++})
  const run=createTrainingGroupIpResolver({lookup,admit,recordFailure,gate}),next=vi.fn()
  const first=run(request(),response(),next);await new Promise(r=>setTimeout(r,0))
  const second=run(request(),response(),next);release(false);await Promise.all([first,second])
  expect(lookup).toHaveBeenCalledTimes(1);expect(admit).toHaveBeenCalledTimes(2);expect(next).not.toHaveBeenCalled()
 })
 it('one narrow SQL retains exact binding/current owner/time and no definition reads',async()=>{
  vi.mocked(prisma.$queryRaw).mockResolvedValue([{id}])
  expect(await lookupTrainingGroupRateScope(trainingGroupRateScope(request())!)).toBe(true)
  const call=vi.mocked(prisma.$queryRaw).mock.calls[0],text=(call[0] as unknown as string[]).join('?')
  expect(text).toContain('SELECT r.id');expect(text).toContain("interval '48 hours'");expect(text).toContain('a.published_at=r.published_at')
  expect(text).toContain('r.closes_at>statement_timestamp()');expect(text).toContain('u.is_active AND NOT u.is_frozen')
  expect(text).not.toContain('definition');expect(prisma.$queryRaw).toHaveBeenCalledTimes(1)
 })
 it('bounded gate holds live SQL on timeout and never runs expired queue',async()=>{
  const gate=new BoundedAdmissionGate({name:'training_test_timeout',maxConcurrent:2,maxQueue:2,maxWaitMs:15})
  const releases:Array<(v:boolean)=>void>=[],lookup=vi.fn(()=>new Promise<boolean>(resolve=>releases.push(resolve)))
  const run=createTrainingGroupIpResolver({lookup,gate,responseTimeoutMs:60}),responses=Array.from({length:4},response),next=vi.fn()
  await Promise.all(responses.map(res=>run(request(),res,next)))
  expect(lookup).toHaveBeenCalledTimes(2);expect(gate.getStats()).toMatchObject({active:2,queued:0})
  for(const res of responses)expect(res.status).toHaveBeenCalledWith(503)
  expect(next).not.toHaveBeenCalled();releases.forEach(fn=>fn(true));await new Promise(r=>setTimeout(r,0))
  expect(gate.getStats()).toMatchObject({active:0,queued:0});expect(next).not.toHaveBeenCalled()
 })
 it('an aborted queued request never starts SQL and releases its queue slot',async()=>{
  const gate=new BoundedAdmissionGate({name:'training_abort_queue',maxConcurrent:1,maxQueue:2,maxWaitMs:500})
  let release!:(v:boolean)=>void
  const lookup=vi.fn(()=>new Promise<boolean>(r=>{release=r})),run=createTrainingGroupIpResolver({lookup,gate})
  const first=run(request(),response(),vi.fn());await new Promise(r=>setTimeout(r,0))
  const gone=response(),next=vi.fn(),queued=run(request(),gone,next);gone.destroyed=true
  release(true);await Promise.all([first,queued])
  expect(lookup).toHaveBeenCalledTimes(1);expect(next).not.toHaveBeenCalled();expect(gone.json).not.toHaveBeenCalled()
  expect(gate.getStats()).toMatchObject({active:0,queued:0})
 })
 it('late SQL rejection is observed after timeout and releases held permit',async()=>{
  const gate=new BoundedAdmissionGate({name:'training_late_reject',maxConcurrent:1,maxQueue:0,maxWaitMs:1})
  let reject!:(e:Error)=>void
  const lookup=vi.fn(()=>new Promise<boolean>((_r,j)=>{reject=j})),res=response(),next=vi.fn(),unhandled=vi.fn()
  process.on('unhandledRejection',unhandled)
  try{
   await createTrainingGroupIpResolver({lookup,gate,responseTimeoutMs:10})(request(),res,next)
   expect(res.status).toHaveBeenCalledWith(503);expect(gate.getStats().active).toBe(1)
   reject(Error('late'));await new Promise(r=>setTimeout(r,5))
   expect(gate.getStats().active).toBe(0);expect(unhandled).not.toHaveBeenCalled();expect(next).not.toHaveBeenCalled()
  }finally{process.removeListener('unhandledRejection',unhandled)}
 })
 it('lookup failure is closed and disconnected responses untouched',async()=>{
  const next=vi.fn(),failed=response();await createTrainingGroupIpResolver({lookup:async()=>{throw Error('offline')}})(request(),failed,next)
  expect(failed.status).toHaveBeenCalledWith(503);expect(next).not.toHaveBeenCalled()
  const gone=response();gone.destroyed=true;await createTrainingGroupIpResolver({lookup:async()=>true})(request(),gone,next)
  expect(gone.json).not.toHaveBeenCalled();expect(next).not.toHaveBeenCalled()
 })
})
