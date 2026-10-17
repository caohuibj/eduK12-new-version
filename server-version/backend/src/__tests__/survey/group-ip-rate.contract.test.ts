import { createHash } from 'node:crypto'
import { afterEach,describe,expect,it,vi } from 'vitest'
import type { Request,Response } from 'express'
vi.mock('../../config/database',()=>({prisma:{$queryRaw:vi.fn()}}))
vi.mock('../../modules/survey/identity.service',()=>({hashResearchCredential:(s:string)=>createHash('sha256').update(s).digest('hex')}))
import { prisma } from '../../config/database'
import { BoundedAdmissionGate } from '../../services/boundedAdmissionGate'
import { createSurveyPublicRateLimiter,surveyGroupRateScope,lookupSurveyGroupRateScope } from '../../modules/survey/public-rate.middleware'
const publicId='d1c8c1eb-4e08-4387-ad04-141faac2cae4',waveId='4d639ebc-c5e4-47ee-9f15-27c3f66410f1',attemptId='10000000-0000-0000-0000-000000000001'
const credential='a'.repeat(43),researchCode='R-ABCDEFGH'
const request=(tail='waves/'+waveId+'/start',body:unknown={researchCode,accessCredential:credential},method='POST')=>({method,path:'/r/'+publicId+'/'+tail,body}) as Request
const response=()=>{
  const r={headersSent:false,writableEnded:false,destroyed:false,status:vi.fn(),json:vi.fn(),setHeader:vi.fn()}
  r.status.mockReturnValue(r);r.json.mockReturnValue(r)
  return r as unknown as Response&typeof r
}
afterEach(()=>vi.clearAllMocks())
describe('Group IP request eligibility is scoped, bounded and never mutation authority',()=>{
  it('does not query absent/malformed proof, unknown endpoint or project-wide privacy actions',async()=>{
    const lookup=vi.fn(async()=>true),standard=vi.fn(),middleware=createSurveyPublicRateLimiter({lookup,standard})
    for(const req of [request('info',undefined,'GET'),request('info',{}),request('info',{groupIp:true}),
      request('enter',{researchCode,accessCredential:credential}),request('withdraw-linked'),request('revoke-access'),
      request('waves/'+waveId+'/arbitrary'),request('attempts/'+attemptId+'/arbitrary'),
      request('attempts/'+attemptId+'/cognitive/go/not-a-uuid/read'),request('waves/not-uuid/start')]){
      await middleware(req,response(),vi.fn())
    }
    expect(lookup).not.toHaveBeenCalled();expect(standard).toHaveBeenCalledTimes(10)
  })
  it('requires separate entry vs participant credentials and exact path target',()=>{
    expect(surveyGroupRateScope(request('info',{entryToken:credential}))).toMatchObject({publicId,entryHash:expect.any(String)})
    expect(surveyGroupRateScope(request('waves/'+waveId+'/join',{accessCredential:credential}))).toBeNull()
    expect(surveyGroupRateScope(request('waves/'+waveId+'/join',{entryToken:credential}))).toMatchObject({waveId,linked:true})
    expect(surveyGroupRateScope(request('waves/'+waveId+'/start-unlinked',{entryToken:credential}))).toMatchObject({waveId,linked:false})
    expect(surveyGroupRateScope(request('enter',{waveId,researchCode,accessCredential:credential}))).toMatchObject({waveId,researchCode})
    expect(surveyGroupRateScope(request('attempts/'+attemptId+'/task',{entryToken:credential}))).toBeNull()
    expect(surveyGroupRateScope(request('attempts/'+attemptId+'/cognitive/go/start',{accessCredential:credential}))).toMatchObject({attemptId,slotKey:'go'})
  })
  it('only database-confirmed scope skips the original Redis budget',async()=>{
    const lookup=vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true),standard=vi.fn(),next=vi.fn()
    const middleware=createSurveyPublicRateLimiter({lookup,standard})
    await middleware(request(),response(),next);expect(standard).toHaveBeenCalledTimes(1);expect(next).not.toHaveBeenCalled()
    await middleware(request(),response(),next);expect(standard).toHaveBeenCalledTimes(1);expect(next).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(lookup.mock.calls)).not.toContain(credential)
  })
  it('performs narrow frozen publication, live owner/window and credential query',async()=>{
    vi.mocked(prisma.$queryRaw).mockResolvedValue([{id:waveId}])
    expect(await lookupSurveyGroupRateScope(surveyGroupRateScope(request())!)).toBe(true)
    const call=vi.mocked(prisma.$queryRaw).mock.calls[0],sql=call[0] as unknown as string[]
    const text=sql.join('?')
    expect(text).toContain('SELECT w.id');expect(text).toContain("w.group_ip_policy IS NOT NULL");expect(text).not.toContain("compiled_snapshot")
    expect(text).toContain("interval '48 hours'");expect(text).toContain('w.finish_until>statement_timestamp()')
    expect(text).toContain("g.status='ACTIVE'");expect(text).not.toContain('SELECT pub.compiled_snapshot')
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1)
  })
  it('holds timed-out live SQL slots and expires queued work before execution',async()=>{
    const gate=new BoundedAdmissionGate({name:'group_contract_timeout',maxConcurrent:2,maxQueue:2,maxWaitMs:15})
    const releases:Array<(v:boolean)=>void>=[],lookup=vi.fn(()=>new Promise<boolean>(resolve=>releases.push(resolve)))
    const middleware=createSurveyPublicRateLimiter({lookup,gate,responseTimeoutMs:60,standard:vi.fn()})
    const replies=[response(),response(),response(),response()],next=vi.fn()
    await Promise.all(replies.map(res=>middleware(request(),res,next)))
    expect(lookup).toHaveBeenCalledTimes(2);expect(gate.getStats()).toMatchObject({active:2,queued:0})
    for(const res of replies){expect(res.status).toHaveBeenCalledWith(503);expect(res.json).toHaveBeenCalledTimes(1)}
    expect(next).not.toHaveBeenCalled()
    releases.forEach(release=>release(true));await new Promise(r=>setTimeout(r,0))
    expect(gate.getStats()).toMatchObject({active:0,queued:0});expect(lookup).toHaveBeenCalledTimes(2)
    for(const res of replies)expect(res.json).toHaveBeenCalledTimes(1)
  })
  it('observes a late SQL rejection after response timeout and releases its held slot',async()=>{
    const gate=new BoundedAdmissionGate({name:'group_contract_late_rejection',maxConcurrent:1,maxQueue:0,maxWaitMs:1})
    let rejectQuery!:(e:Error)=>void
    const lookup=vi.fn(()=>new Promise<boolean>((_,reject)=>{rejectQuery=reject}))
    const res=response(),next=vi.fn(),unhandled=vi.fn()
    process.on('unhandledRejection',unhandled)
    try{
      await createSurveyPublicRateLimiter({lookup,gate,responseTimeoutMs:10,standard:vi.fn()})(request(),res,next)
      expect(res.status).toHaveBeenCalledWith(503);expect(gate.getStats().active).toBe(1)
      rejectQuery(new Error('late database rejection'));await new Promise(resolve=>setTimeout(resolve,5))
      expect(gate.getStats().active).toBe(0);expect(unhandled).not.toHaveBeenCalled()
      expect(res.json).toHaveBeenCalledTimes(1);expect(next).not.toHaveBeenCalled()
    }finally{process.removeListener('unhandledRejection',unhandled)}
  })
  it('does not write after disconnect, rejects lookup failure closed',async()=>{
    const closed=response();closed.destroyed=true
    const closedNext=vi.fn()
    await createSurveyPublicRateLimiter({lookup:async()=>true,standard:vi.fn()})(request(),closed,closedNext)
    expect(closed.json).not.toHaveBeenCalled();expect(closedNext).not.toHaveBeenCalled()
    const failed=response(),next=vi.fn(),standard=vi.fn()
    await createSurveyPublicRateLimiter({lookup:async()=>{throw new Error('offline')},standard})(request(),failed,next)
    expect(failed.status).toHaveBeenCalledWith(503);expect(failed.setHeader).toHaveBeenCalledWith('Retry-After','1')
    expect(standard).not.toHaveBeenCalled();expect(next).not.toHaveBeenCalled()
  })
})
