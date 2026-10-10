import express from 'express'
import type { Server } from 'node:http'
import { afterAll,beforeAll,beforeEach,describe,expect,it,vi } from 'vitest'

const m=vi.hoisted(()=>({
  query:vi.fn(),get:vi.fn(),submit:vi.fn(),image:vi.fn(),video:vi.fn(),
  compositeConsent:vi.fn(),cognitiveConsent:vi.fn(),
}))
vi.mock('../../config/database',()=>({prisma:{$queryRaw:m.query}}))
vi.mock('../../middleware/auth',()=>({
  authenticateSchool:(req:any,res:any,next:any)=>{
    const actor=req.headers['x-school-user']
    if(!actor)return res.status(401).json({code:401,data:null})
    req.user={userId:actor,accountDomain:req.headers['x-account-domain']??'SCHOOL',
      role:req.headers['x-role']??'STUDENT',platformRole:'STANDARD'}
    next()
  },
}))
vi.mock('../../modules/composite/composite.controller',()=>({compositeController:{
  getAttempt:vi.fn(),submitFinalFormSection:vi.fn(),submitFinalScale:vi.fn(),
  getEmbeddedSituational:vi.fn(),embeddedSituationalAsset:vi.fn(),
  submitEmbeddedSituational:vi.fn(),
}}))
vi.mock('../../modules/composite/composite-image.controller',()=>({compositeImageController:{
  authenticatedFormImage:vi.fn(),authenticatedScaleImage:vi.fn(),
}}))
vi.mock('../../modules/composite/composite-video.controller',()=>({compositeVideoController:{
  authenticatedFormVideo:vi.fn(),authenticatedScaleVideo:vi.fn(),
}}))
vi.mock('../../modules/situational/situational-video.controller',()=>({situationalVideoController:{
  embeddedAuthenticated:vi.fn(),
}}))
vi.mock('../../modules/cognitive/cognitive-image.controller',()=>({cognitiveImageController:{
  content:m.image,
}}))
vi.mock('../../modules/cognitive/cognitive-video.controller',()=>({cognitiveVideoController:{
  issue:m.video,
}}))
vi.mock('../../modules/cognitive/session.service',()=>({getSession:m.get}))
vi.mock('../../modules/cognitive/final-submit.service',()=>({submitCognitiveSessionFinalWithContext:m.submit}))
vi.mock('../../modules/assessment-relational/runtime-consent',()=>({relationalRuntimeConsentAuthority:{
  assertCompositeFinal:m.compositeConsent,assertCognitiveFinal:m.cognitiveConsent,
}}))

import schoolCompositeRoutes from '../../modules/campus/composite.routes'
import { csrfProtection } from '../../middleware/csrf'

const attempt='00000000-0000-4000-8000-000000000001'
const item='00000000-0000-4000-8000-000000000002'
const session='00000000-0000-4000-8000-000000000003'
const prefix=`/composite-attempts/${attempt}/items/${item}/cognitive/${session}`
const schoolHeaders={'x-school-user':'student-A','x-role':'STUDENT'}
let origin:string,server:Server
async function request(path:string,method='GET',body?:unknown,headers:Record<string,string>={}){
  return fetch(origin+'/api/campus'+path,{method,
    headers:{...schoolHeaders, 'Content-Type':'application/json',
      Cookie:'huischool_csrf=school-token','X-CSRF-Token':'school-token',...headers},
    ...(body===undefined?{}:{body:JSON.stringify(body)})})
}
describe('SCHOOL frozen Composite Cognitive child / FINAL-only',()=>{
  beforeAll(async()=>{
    const app=express()
    app.use(express.json())
    app.use('/api',csrfProtection)
    app.use('/api/campus',schoolCompositeRoutes)
    server=app.listen(0,'127.0.0.1')
    await new Promise<void>(resolve=>server.once('listening',resolve))
    const address=server.address()
    if(!address||typeof address==='string')throw Error('missing port')
    origin='http://127.0.0.1:'+address.port
  })
  afterAll(async()=>{
    server.closeAllConnections()
    await new Promise<void>(resolve=>server.close(()=>resolve()))
  })
  beforeEach(()=>{
    vi.clearAllMocks()
    // First authoritative SQL: parent Composite -> current Run/Activity;
    // second SQL: exact Cognitive child / slot / current student SELF.
    m.query.mockResolvedValue([{id:'allowed'}])
    m.get.mockResolvedValue({sessionId:session,status:'IN_PROGRESS',deliveryMode:'FINAL_ONLY',
      definitionHash:'a'.repeat(64),config:{trialCount:10}})
    m.submit.mockResolvedValue({data:{replayed:false,response:{result:{score:900}}},
      internalContext:{compositeAttemptId:attempt,attemptEpoch:1}})
    m.image.mockImplementation((_req:any,res:any)=>res.status(200).send('asset'))
    m.video.mockImplementation((_req:any,res:any)=>res.status(200).json({code:0,data:{videoUrl:'signed'}}))
    m.compositeConsent.mockResolvedValue(undefined)
    m.cognitiveConsent.mockResolvedValue(undefined)
  })
  it('accepts only the bound student SELF child, not cross-domain, outsider, guardian or swapped child',async()=>{
    for(const headers of [
      {'x-account-domain':'TRAINING'},
      {'x-role':'PARENT'},
      {'x-role':'TEACHER'},
    ])expect((await request(prefix,'GET',undefined,headers)).status).toBe(404)
    m.query.mockReset().mockResolvedValueOnce([{id:'parent'}]).mockResolvedValueOnce([])
    expect((await request(prefix)).status).toBe(404)
    expect(m.get).not.toHaveBeenCalled()
    const sql=m.query.mock.calls[1][0].strings.join('')
    for(const requirement of [
      'cognitive_sessions child','composite_assessment_attempts parent',
      'composite_assessment_items slot','assessment_run_executions execution',
      'assignment.relationship_kind',"'SELF_REPORT'","slot.type='COGNITIVE'",
      'child.composite_item_id=','child.composite_attempt_id=',
      'subject.user_id=','respondent.user_id=','parent.delivery_mode',
    ])expect(sql).toContain(requirement)
  })
  it('reuses the frozen session without leaking completed scores or reference metrics',async()=>{
    m.get.mockResolvedValueOnce({sessionId:session,status:'COMPLETED',deliveryMode:'FINAL_ONLY',
      config:{trialCount:10},result:{score:98,metrics:{ageNorm:45}},score:98,
      qualityFlags:{flag:'sensitive'},reference:{band:'high'},report:{risk:'high'}})
    const response=await request(prefix)
    expect(response.status).toBe(200)
    const data=(await response.json()).data
    expect(data).toMatchObject({sessionId:session,status:'COMPLETED',feedbackDeferred:true})
    expect(JSON.stringify(data)).not.toMatch(/ageNorm|"score"|qualityFlags|"risk"|reference/)
    expect(response.headers.get('cache-control')).toBe('no-store')
  })
  it('routes Cognitive image and signed video through campus binding, never generic training endpoints',async()=>{
    expect((await request(prefix+'/assets/abc/content')).status).toBe(200)
    const video=await request(prefix+'/video-capabilities','POST',{videoKey:'instruction:0'})
    expect(video.status).toBe(200)
    expect(m.image.mock.calls[0][0].params.id).toBe(session)
    expect(m.video.mock.calls[0][0].params.id).toBe(session)
  })
  it('requires parent and child consent; valid FINAL returns receipt only and replays safely',async()=>{
    const body={submissionId:'0123456789abcdef',attemptEpoch:1,
      definitionHash:'a'.repeat(64),trials:[{trialIndex:0,payload:{choice:1}}]}
    expect((await request(prefix+'/submit','POST',{...body, score:999})).status).toBe(400)
    expect(m.submit).not.toHaveBeenCalled()
    const badCsrf=await request(prefix+'/submit','POST',body,{'X-CSRF-Token':'wrong'})
    expect(badCsrf.status).toBe(403)
    expect(m.submit).not.toHaveBeenCalled()
    const result=await request(prefix+'/submit','POST',body)
    expect(result.status).toBe(200)
    const data=(await result.json()).data
    expect(data).toEqual({completed:true,feedbackDeferred:true,replayed:false})
    expect(JSON.stringify(data)).not.toContain('score')
    expect(m.compositeConsent).toHaveBeenCalledWith(attempt,'student-A')
    expect(m.cognitiveConsent).toHaveBeenCalledWith(session,'student-A')
    expect(m.submit).toHaveBeenCalledWith('student-A',expect.objectContaining({
      sessionId:session,submissionId:body.submissionId,trials:body.trials,
    }))
    m.submit.mockResolvedValueOnce({data:{replayed:true,response:{score:5000}},
      internalContext:{compositeAttemptId:attempt,attemptEpoch:1}})
    const replay=await request(prefix+'/submit','POST',body)
    expect((await replay.json()).data).toEqual({completed:true,feedbackDeferred:true,replayed:true})
  })
  it('denies a newly revoked school population before reading or scoring a child',async()=>{
    m.query.mockResolvedValueOnce([]) // The parent current Run authority was revoked.
    const response=await request(prefix)
    expect(response.status).toBe(404)
    expect(m.get).not.toHaveBeenCalled()
    expect(m.submit).not.toHaveBeenCalled()
  })
})
