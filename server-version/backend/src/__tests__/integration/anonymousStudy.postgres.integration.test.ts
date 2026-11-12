import {randomUUID} from 'node:crypto'
import {EventEmitter} from 'node:events'
import {beforeAll,afterAll,describe,expect,it,vi} from 'vitest'
import express from 'express'
import {prisma} from '../../config/database'
import {integrationDatabaseUrl,requireIsolatedReleaseDatabase} from './integration-env'
import * as study from '../../modules/anonymous-study/service'
import * as composite from '../../modules/composite/composite.service'
import {ensureCompositeFormSections,submitCompositeFormSectionFinal} from '../../modules/composite/final-submit.service'
import {hashRecoveryToken} from '../../services/anonymousAccess'
import {publicAnonymousStudyRouter} from '../../modules/anonymous-study/routes'
import {csrfProtection} from '../../middleware/csrf'
import {publicAssessmentRateLimiters} from '../../middleware/publicAssessmentRateLimit'
import {anonymousStartAdmissionGate,resetAnonymousStartAdmissionGateForTests} from '../../modules/anonymous-study/study-start-admission-gate'
import {requestObservabilityMiddleware,resetRuntimeObservabilityForTests,runtimeMetricLines} from '../../services/runtimeObservability'
const suite=integrationDatabaseUrl('RELEASE_INTEGRATION_DATABASE_URL')?describe:describe.skip
const phaseCount = (phase:string):number => {
 const prefix=`ptool_assessment_phase_duration_seconds_count{phase="${phase}",route="`
 return runtimeMetricLines().filter(line=>line.startsWith(prefix))
  .reduce((sum,line)=>sum+Number(line.slice(line.lastIndexOf(' ')+1)),0)
}
const observedPublicStart = async <T>(run:()=>Promise<T>):Promise<T> => {
 const request={method:'POST',path:'/api/public/anonymous-studies/waves/example/start',
  baseUrl:'',route:{path:'/api/public/anonymous-studies/waves/:waveId/start'}} as any
 const response=Object.assign(new EventEmitter(),{statusCode:200}) as any
 let started!:Promise<T>
 requestObservabilityMiddleware(request,response,()=>{started=run()})
 try{return await started}
 catch(error){response.statusCode=503;throw error}
 finally{response.emit('finish')}
}
suite('anonymous research identity and exact-wave PostgreSQL',()=>{
 let owner:string,other:string,cid:string,itemId:string
 beforeAll(async()=>{
  requireIsolatedReleaseDatabase(process.env.RELEASE_INTEGRATION_DATABASE_URL!)
  owner=(await prisma.user.create({data:{username:randomUUID(),passwordHash:'test',role:'TEACHER'}})).id
  other=(await prisma.user.create({data:{username:randomUUID(),passwordHash:'test',role:'TEACHER'}})).id
  const course=await prisma.course.create({data:{title:'anonymous study test',courseCode:randomUUID(),status:'PUBLISHED',creatorId:owner}})
  const c=await prisma.compositeAssessment.create({data:{code:randomUUID(),name:'Study form',status:'DRAFT',courseId:course.id,createdBy:owner,publicEnabled:true,expiresAt:new Date(Date.now()+7*86400000)}});cid=c.id
  itemId=(await prisma.compositeAssessmentItem.create({data:{compositeAssessmentId:cid,type:'FORM',position:0,required:true,formType:'text_input',formLabel:'Response'}})).id
  await ensureCompositeFormSections(cid)
  await composite.publishComposite(owner,'TEACHER',cid)
 })
 afterAll(async()=>{
  // Bound attempts and their audit graph are deliberately retained. This entire
  // synthetic database belongs to the disposable job; do not bypass its triggers.
  await prisma.$disconnect()
 })

 const token=(limit=0)=>composite.createAccessTokenForComposite(owner,'TEACHER',cid,new Date(Date.now()+86400000).toISOString(),limit)
 const complete=async(a:{attemptId:string;recoveryToken:string},answer:string)=>{
  const state=await composite.getAttemptState(a.attemptId,{recoveryTokenHash:hashRecoveryToken(a.recoveryToken)})
  const section=state.formSections[0]
  await submitCompositeFormSectionFinal({attemptId:a.attemptId,sectionId:section.id,submissionId:randomUUID(),attemptEpoch:1,definitionHash:section.definitionHash,contextSnapshotHash:null,answers:[{formItemId:itemId,value:answer}],recoveryTokenHash:hashRecoveryToken(a.recoveryToken)})
  expect((await composite.getAttemptState(a.attemptId,{recoveryTokenHash:hashRecoveryToken(a.recoveryToken)})).status).toBe('COMPLETED')
 }
 it('isolates identities, admits once concurrently, counts A/B and exports only the selected wave',async()=>{
  const s=await study.createStudy(owner,'Study'),t1=await token(),t2=await token()
  const w1=await study.addWave(owner,'TEACHER',s.id,{compositeId:cid,tokenId:t1.id,title:'One'})
  const w2=await study.addWave(owner,'TEACHER',s.id,{compositeId:cid,tokenId:t2.id,title:'Two'})
  await expect(study.joinStudy(w1.id,t1.token,false)).rejects.toMatchObject({statusCode:400})
  const p=await study.joinStudy(w1.id,t1.token,true),p2=await study.joinStudy(w1.id,t1.token,true)
  const raw=await prisma.$queryRaw<Array<{hash:string}>>`SELECT credential_hash AS hash FROM anonymous_study_participants WHERE study_id=${s.id}`
  expect(raw.map(r=>r.hash)).not.toContain(p.credential);expect(raw.map(r=>r.hash)).toContain(hashRecoveryToken(p.credential))
  expect(await prisma.organizationMembership.count({where:{userId:owner}})).toBe(0)
  const [a,b]=await Promise.all([study.startStudyWave(s.id,w1.id,p.credential),study.startStudyWave(s.id,w1.id,p.credential)])
  await expect(composite.restartPublicAttempt(a.attemptId,hashRecoveryToken('other'))).rejects.toMatchObject({statusCode:403})
  await expect(composite.restartPublicAttempt(a.attemptId,hashRecoveryToken(a.recoveryToken))).rejects.toMatchObject({statusCode:409})
  expect(a).toEqual(b);expect((await prisma.compositeAssessmentAccessToken.findUniqueOrThrow({where:{id:t1.id}})).usedCount).toBe(1)
  expect((await prisma.compositeAssessmentAttempt.findUniqueOrThrow({where:{id:a.attemptId}})).userId).toBeNull()
  await complete(a,'WAVE_ONE_B')
  const guest=await composite.startPublicAttempt(t1.token);await complete({attemptId:guest.attempt.id,recoveryToken:guest.recoveryToken!},'WAVE_ONE_A')
  const second=await study.startStudyWave(s.id,w2.id,p.credential);await complete(second,'WAVE_TWO_ONLY')
  expect((await study.participantHome(s.id,p.credential)).waves.map(w=>w.attemptId)).toEqual([a.attemptId,second.attemptId])
  expect((await study.participantHome(s.id,p2.credential)).waves.every(w=>w.attemptId===null)).toBe(true)
  await expect(study.participantHome(s.id,p.displayCode)).rejects.toMatchObject({statusCode:404})
  const s2=await study.createStudy(owner,'Other study')
  const unrelated=await token(),otherWaveToken=await token()
  const otherWave=await study.addWave(owner,'TEACHER',s2.id,{compositeId:cid,tokenId:otherWaveToken.id,title:'Other study wave'})
  await expect(study.participantHome(s2.id,p.credential)).rejects.toMatchObject({statusCode:404})
  await expect(study.waveStatistics(other,s.id)).rejects.toMatchObject({statusCode:404})
  await expect(study.exportWaveCsv(other,'ADMIN',s.id,w1.id)).rejects.toMatchObject({statusCode:404})
  const stats=await study.waveStatistics(owner,s.id)
  expect(stats.list[0]).toMatchObject({participants:2,completedParticipants:2,attempts:2,completedAttempts:2})
  const csv=await study.exportWaveCsv(owner,'TEACHER',s.id,w1.id)
  expect(csv).toContain('WAVE_ONE_B');expect(csv).toContain('WAVE_ONE_A');expect(csv).not.toContain('WAVE_TWO_ONLY');expect(csv).toContain(p.displayCode);expect(csv).not.toContain(p.credential)
  await expect(study.addWave(owner,'TEACHER',s.id,{compositeId:cid,tokenId:t1.id,title:'Used'})).rejects.toMatchObject({statusCode:404})
  await study.closeStudy(owner,s.id)
  await expect(composite.getPublicCompositeInfo(t1.token)).rejects.toMatchObject({statusCode:403})
  await expect(composite.startPublicAttempt(t1.token)).rejects.toMatchObject({statusCode:403})
  const restoredGuest=await composite.startPublicAttempt(t1.token,guest.recoveryToken!)
  expect(restoredGuest.attempt).toMatchObject({id:guest.attempt.id,status:'COMPLETED'})
  expect((await prisma.compositeAssessmentAccessToken.findUniqueOrThrow({where:{id:t1.id}})).usedCount).toBe(2)
  expect((await prisma.compositeAssessmentAccessToken.findUniqueOrThrow({where:{id:t2.id}})).isActive).toBe(false)
  expect((await composite.getPublicCompositeInfo(unrelated.token)).id).toBe(cid)
  expect((await composite.getPublicCompositeInfo(otherWaveToken.token)).studyEntryPath).toBe(otherWave.entryPath)
  await expect(study.closeStudy(other,s2.id)).rejects.toMatchObject({statusCode:404})
  expect((await prisma.compositeAssessmentAccessToken.findUniqueOrThrow({where:{id:otherWaveToken.id}})).isActive).toBe(true)
  expect(await study.closeStudy(owner,s.id)).toEqual({status:'CLOSED'})
  await expect(study.startStudyWave(s.id,w2.id,p2.credential)).rejects.toMatchObject({statusCode:403})
  expect(await study.recoverStudyWave(s.id,w1.id,p.credential)).toEqual({...a,state:'COMPLETED'})
  const app=express();app.use(express.json());app.use('/api',csrfProtection);app.use('/api/public/anonymous-studies',...publicAssessmentRateLimiters,publicAnonymousStudyRouter)
  const server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve))
  const port=(server.address() as {port:number}).port,url=`http://127.0.0.1:${port}/api/public/anonymous-studies/${s.id}`
  try {
   expect((await fetch(url,{headers:{Cookie:`identity=${p.credential}`}})).status).toBe(404)
   const http=await fetch(url,{headers:{Authorization:`Bearer ${p.credential}`}})
   expect(http.status).toBe(200);expect(http.headers.get('cache-control')).toBe('no-store');expect(JSON.stringify(await http.json())).not.toContain(p.credential)
   const ownHeaders={Authorization:`Bearer ${p.credential}`,'Content-Type':'application/json'}
   const recovered=await fetch(`${url}/waves/${w1.id}/recover`,{method:'POST',headers:ownHeaders,body:'{}'})
   expect(recovered.status).toBe(200);expect((await recovered.json()).data).toEqual({...a,state:'COMPLETED'})
   const closed=await fetch(`${url}/waves/${w2.id}/start`,{method:'POST',headers:ownHeaders,body:'{}'})
   expect(closed.status).toBe(403);expect((await closed.json()).message).toBe('本波次暂不接受新作答')
   const revoked=await fetch(`${url}/revoke`,{method:'POST',headers:ownHeaders,body:'{}'})
   expect(revoked.status).toBe(200);expect((await revoked.json()).data).toEqual({status:'REVOKED'})
  } finally {await new Promise<void>((resolve,reject)=>server.close(err=>err?reject(err):resolve()))}
  await expect(study.participantHome(s.id,p.credential)).rejects.toMatchObject({statusCode:404})
  await expect(study.recoverStudyWave(s.id,w1.id,p.credential)).rejects.toMatchObject({statusCode:404})
  await expect(composite.getAttemptState(a.attemptId,{recoveryTokenHash:hashRecoveryToken(a.recoveryToken)})).rejects.toMatchObject({statusCode:403})
  expect((await study.waveStatistics(owner,s.id)).list[0].completedAttempts).toBe(2)
 },60000)
 it('respects quota and expiry; cannot attach historical public attempts',async()=>{
  const s=await study.createStudy(owner,'Quota'),t=await token(1),w=await study.addWave(owner,'TEACHER',s.id,{compositeId:cid,tokenId:t.id,title:'Quota'})
  const p=await study.joinStudy(w.id,t.token,true),q=await study.joinStudy(w.id,t.token,true)
  const outcomes=await Promise.allSettled([study.startStudyWave(s.id,w.id,p.credential),study.startStudyWave(s.id,w.id,q.credential)])
  expect(outcomes.filter(r=>r.status==='fulfilled')).toHaveLength(1)
  expect((await prisma.compositeAssessmentAccessToken.findUniqueOrThrow({where:{id:t.id}})).usedCount).toBe(1)
  await prisma.compositeAssessmentAccessToken.update({where:{id:t.id},data:{expiresAt:new Date(0)}})
  expect((await study.publicWaveInfo(w.id,t.token)).accepting).toBe(false)
  await expect(study.joinStudy(w.id,t.token,true)).rejects.toMatchObject({statusCode:403})
  const used=await token();await composite.startPublicAttempt(used.token)
  await expect(study.addWave(owner,'TEACHER',s.id,{compositeId:cid,tokenId:used.id,title:'Historical'})).rejects.toMatchObject({statusCode:404})
 },60000)
 it('creates a wave and link once under retries, exposes identity entry and rejects changed or foreign requests',async()=>{
  const s=await study.createStudy(owner,'One action synthetic wave')
  const input={requestId:randomUUID(),compositeId:cid,title:'Wave one',expiresAt:new Date(Date.now()+86400000).toISOString(),maxUses:2}
  const before=await prisma.compositeAssessmentAccessToken.count({where:{compositeAssessmentId:cid}})
  const [first,replayed]=await Promise.all([study.createWaveWithLink(owner,'TEACHER',s.id,input),study.createWaveWithLink(owner,'TEACHER',s.id,input)])
  expect(replayed).toEqual(first)
  expect(await prisma.compositeAssessmentAccessToken.count({where:{compositeAssessmentId:cid}})).toBe(before+1)
  const revealed=await composite.revealAccessToken(owner,'TEACHER',cid,first.tokenId)
  expect((await composite.getPublicCompositeInfo(revealed.token)).studyEntryPath).toBe(first.entryPath)
  await expect(study.createWaveWithLink(owner,'TEACHER',s.id,{...input,title:'Changed'})).rejects.toMatchObject({statusCode:409})
  await expect(study.createWaveWithLink(other,'TEACHER',s.id,{...input,requestId:randomUUID()})).rejects.toMatchObject({statusCode:404})
  await study.closeStudy(owner,s.id)
  await expect(study.createWaveWithLink(owner,'TEACHER',s.id,{...input,requestId:randomUUID()})).rejects.toMatchObject({statusCode:403})
  expect(await prisma.compositeAssessmentAccessToken.count({where:{compositeAssessmentId:cid}})).toBe(before+1)
 })
 it('rolls back the generated token when wave admission fails after token creation',async()=>{
  const s=await study.createStudy(owner,'Synthetic full study')
  for(let ordinal=1;ordinal<=100;ordinal++){
   const t=await token()
   await prisma.$executeRaw`INSERT INTO anonymous_study_waves(id,study_id,access_token_id,title,ordinal) VALUES(${randomUUID()},${s.id},${t.id},${'Synthetic '+ordinal},${ordinal})`
  }
  const before=await prisma.compositeAssessmentAccessToken.count({where:{compositeAssessmentId:cid}})
  await expect(study.createWaveWithLink(owner,'TEACHER',s.id,{requestId:randomUUID(),compositeId:cid,title:'Over limit',expiresAt:new Date(Date.now()+86400000).toISOString(),maxUses:0})).rejects.toMatchObject({statusCode:400})
  expect(await prisma.compositeAssessmentAccessToken.count({where:{compositeAssessmentId:cid}})).toBe(before)
 },60000)
 it('public restart counts toward maxAttempts and never pre-abandons on quota exhaustion (decision D-7, 2026-11-06)',async()=>{
  // The shared composite defaults to maxAttempts=1; raise it for this test
  // only and restore it, so the earlier tests keep their maxAttempts=1 pin.
  await prisma.compositeAssessment.update({where:{id:cid},data:{maxAttempts:2}})
  try {
   const t=await token()
   const first=await composite.startPublicAttempt(t.token)
   expect(first.attempt.status).toBe('IN_PROGRESS')
   await expect(composite.restartPublicAttempt(first.attempt.id,hashRecoveryToken('other'))).rejects.toMatchObject({statusCode:403})
   const second=await composite.restartPublicAttempt(first.attempt.id,hashRecoveryToken(first.recoveryToken!))
   expect(second.attempt.id).not.toBe(first.attempt.id)
   expect((await prisma.compositeAssessmentAttempt.findUniqueOrThrow({where:{id:first.attempt.id}})).status).toBe('ABANDONED')
   expect((await prisma.compositeAssessmentAttempt.findUniqueOrThrow({where:{id:second.attempt.id}})).status).toBe('IN_PROGRESS')
   await expect(composite.restartPublicAttempt(second.attempt.id,hashRecoveryToken(second.recoveryToken!))).rejects.toMatchObject({statusCode:409})
   // Quota exhaustion must not pre-abandon the current attempt.
   expect((await prisma.compositeAssessmentAttempt.findUniqueOrThrow({where:{id:second.attempt.id}})).status).toBe('IN_PROGRESS')
  } finally {
   await prisma.compositeAssessment.update({where:{id:cid},data:{maxAttempts:1}})
  }
 },60000)
 it('anonymous START goes through the admission gate: a held gate surfaces retryable 503, not a pool wait',async()=>{
  // Pin the gate to a single slot with no queue, hold that slot with a dummy
  // task, then start: the pre-gate reads succeed against the real DB, and the
  // gate rejection must surface as ASSESSMENT_START_BUSY (503 + Retry-After),
  // the same contract as the authenticated Training START. Restores the gate
  // afterwards so later tests in this file are unaffected.
  const savedConcurrent=process.env.ANONYMOUS_START_MAX_CONCURRENT
  const savedQueue=process.env.ANONYMOUS_START_MAX_QUEUE
  const savedWait=process.env.ANONYMOUS_START_MAX_WAIT_MS
  process.env.ANONYMOUS_START_MAX_CONCURRENT='1'
  process.env.ANONYMOUS_START_MAX_QUEUE='0'
  process.env.ANONYMOUS_START_MAX_WAIT_MS='15000'
  resetAnonymousStartAdmissionGateForTests()
  const gate=anonymousStartAdmissionGate()
  let releaseGate:(()=>void)|undefined
  const held=new Promise<void>(resolve=>{releaseGate=resolve})
  const holder=gate.run(()=>held)
  try {
   const t=await token()
   const preGateBefore=phaseCount('anonymous.start.pre_gate_ms')
   const admittedBefore=phaseCount('anonymous.start.gate_wait_ms')
   await expect(observedPublicStart(()=>composite.startPublicAttempt(t.token))).rejects.toMatchObject({code:'ASSESSMENT_START_BUSY',statusCode:503})
   expect(phaseCount('anonymous.start.pre_gate_ms')).toBe(preGateBefore+1)
   // Queue rejections never enter the gate, so they have no admitted-wait span.
   expect(phaseCount('anonymous.start.gate_wait_ms')).toBe(admittedBefore)
   // The rejected start must not have claimed the token or created an attempt.
   expect((await prisma.compositeAssessmentAccessToken.findUniqueOrThrow({where:{id:t.id}})).usedCount).toBe(0)
  } finally {
   releaseGate?.()
   await holder
   if(savedConcurrent===undefined)delete process.env.ANONYMOUS_START_MAX_CONCURRENT;else process.env.ANONYMOUS_START_MAX_CONCURRENT=savedConcurrent
   if(savedQueue===undefined)delete process.env.ANONYMOUS_START_MAX_QUEUE;else process.env.ANONYMOUS_START_MAX_QUEUE=savedQueue
   if(savedWait===undefined)delete process.env.ANONYMOUS_START_MAX_WAIT_MS;else process.env.ANONYMOUS_START_MAX_WAIT_MS=savedWait
   resetAnonymousStartAdmissionGateForTests()
  }
 },60000)

 it('anonymous START service spans distinguish new attempt from recovery',async()=>{
  const priorFlag=process.env.ANONYMOUS_START_DIAGNOSTIC_ENABLED
  process.env.ANONYMOUS_START_DIAGNOSTIC_ENABLED='true'
  resetRuntimeObservabilityForTests()
  try{
   const t=await token()
   const created=await observedPublicStart(()=>composite.startPublicAttempt(t.token))
   expect(created.attempt.id).toBeTruthy()
   for(const name of ['pre_gate_ms','gate_wait_ms','gate_slot_ms','tx_wall_ms','post_gate_ms','tx_acquisition_wait_ms','composite_admission_lock_ms']){
    expect(phaseCount('anonymous.start.'+name)).toBe(1)
   }
   expect(phaseCount('anonymous.start.tx_acquisition_failed_ms')).toBe(0)
   expect(phaseCount('anonymous.start.composite_admission_lock_failed_ms')).toBe(0)
   const resumed=await observedPublicStart(()=>composite.startPublicAttempt(t.token,created.recoveryToken!))
   expect(resumed.attempt.id).toBe(created.attempt.id)
   expect(phaseCount('anonymous.start.pre_gate_ms')).toBe(2)
   expect(phaseCount('anonymous.start.post_gate_ms')).toBe(2)
   for(const name of ['gate_wait_ms','gate_slot_ms','tx_wall_ms'])expect(phaseCount('anonymous.start.'+name)).toBe(1)
  }finally{
   if(priorFlag===undefined)delete process.env.ANONYMOUS_START_DIAGNOSTIC_ENABLED
   else process.env.ANONYMOUS_START_DIAGNOSTIC_ENABLED=priorFlag
  }
 },60000)
 it('anonymous START captures failed transaction acquisition and failed admission lock',async()=>{
  const priorFlag=process.env.ANONYMOUS_START_DIAGNOSTIC_ENABLED
  process.env.ANONYMOUS_START_DIAGNOSTIC_ENABLED='true'
  resetRuntimeObservabilityForTests()
  try{
   const tokenBeforeCallback=await token()
   const acquireSpy=vi.spyOn(prisma as any,'$transaction').mockImplementationOnce(
    async()=>{throw new Error('simulated transaction acquisition failure')},
   )
   try{
    await expect(observedPublicStart(()=>composite.startPublicAttempt(tokenBeforeCallback.token))).rejects.toThrow('simulated transaction acquisition failure')
   }finally{acquireSpy.mockRestore()}
   expect(phaseCount('anonymous.start.tx_acquisition_failed_ms')).toBe(1)
   expect(phaseCount('anonymous.start.tx_acquisition_wait_ms')).toBe(0)
   expect(phaseCount('anonymous.start.tx_wall_ms')).toBe(1)
   expect(phaseCount('anonymous.start.gate_slot_ms')).toBe(1)
   const tokenLockFailure=await token()
   const lockSpy=vi.spyOn(prisma as any,'$transaction').mockImplementationOnce(
    // The new anonymous admission takes its first SHARE lock through
    // $queryRawUnsafe. Inject failure at that actual call boundary.
    async(callback:any)=>callback({$queryRawUnsafe:async()=>{throw new Error('simulated admission lock failure')}}),
   )
   try{
    await expect(observedPublicStart(()=>composite.startPublicAttempt(tokenLockFailure.token))).rejects.toThrow('simulated admission lock failure')
   }finally{lockSpy.mockRestore()}
   expect(phaseCount('anonymous.start.composite_admission_lock_failed_ms')).toBe(1)
   expect(phaseCount('anonymous.start.composite_admission_lock_ms')).toBe(0)
   expect(phaseCount('anonymous.start.tx_acquisition_wait_ms')).toBe(1)
   expect(phaseCount('anonymous.start.tx_wall_ms')).toBe(2)
   expect(phaseCount('anonymous.start.gate_slot_ms')).toBe(2)
  }finally{
   if(priorFlag===undefined)delete process.env.ANONYMOUS_START_DIAGNOSTIC_ENABLED
   else process.env.ANONYMOUS_START_DIAGNOSTIC_ENABLED=priorFlag
  }
 },60000)
})
