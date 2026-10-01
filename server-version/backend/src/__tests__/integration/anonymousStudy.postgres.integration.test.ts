import {randomUUID} from 'node:crypto'
import {beforeAll,describe,expect,it} from 'vitest'
import express from 'express'
import {prisma} from '../../config/database'
import {integrationDatabaseUrl} from './integration-env'
import * as study from '../../modules/anonymous-study/service'
import * as composite from '../../modules/composite/composite.service'
import {ensureCompositeFormSections,submitCompositeFormSectionFinal} from '../../modules/composite/final-submit.service'
import {hashRecoveryToken} from '../../services/anonymousAccess'
import {publicAnonymousStudyRouter} from '../../modules/anonymous-study/routes'
import {csrfProtection} from '../../middleware/csrf'
import {publicAssessmentRateLimiters} from '../../middleware/publicAssessmentRateLimit'
const suite=integrationDatabaseUrl('RELEASE_INTEGRATION_DATABASE_URL')?describe:describe.skip
suite('anonymous research identity and exact-wave PostgreSQL',()=>{
 let owner:string,other:string,cid:string,itemId:string
 beforeAll(async()=>{
  owner=(await prisma.user.create({data:{username:randomUUID(),passwordHash:'test',role:'TEACHER'}})).id
  other=(await prisma.user.create({data:{username:randomUUID(),passwordHash:'test',role:'TEACHER'}})).id
  const course=await prisma.course.create({data:{title:'anonymous study test',courseCode:randomUUID(),status:'PUBLISHED',creatorId:owner}})
  const c=await prisma.compositeAssessment.create({data:{code:randomUUID(),name:'Study form',status:'PUBLISHED',courseId:course.id,createdBy:owner,publicEnabled:true,publishedAt:new Date()}});cid=c.id
  itemId=(await prisma.compositeAssessmentItem.create({data:{compositeAssessmentId:cid,type:'FORM',position:0,required:true,formType:'text',formLabel:'Response'}})).id
  await ensureCompositeFormSections(cid)
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
  await expect(study.participantHome(s2.id,p.credential)).rejects.toMatchObject({statusCode:404})
  await expect(study.waveStatistics(other,s.id)).rejects.toMatchObject({statusCode:404})
  await expect(study.exportWaveCsv(other,'ADMIN',s.id,w1.id)).rejects.toMatchObject({statusCode:404})
  const stats=await study.waveStatistics(owner,s.id)
  expect(stats.list[0]).toMatchObject({participants:2,completedParticipants:2,attempts:2,completedAttempts:2})
  const csv=await study.exportWaveCsv(owner,'TEACHER',s.id,w1.id)
  expect(csv).toContain('WAVE_ONE_B');expect(csv).toContain('WAVE_ONE_A');expect(csv).not.toContain('WAVE_TWO_ONLY');expect(csv).toContain(p.displayCode);expect(csv).not.toContain(p.credential)
  await expect(study.addWave(owner,'TEACHER',s.id,{compositeId:cid,tokenId:t1.id,title:'Used'})).rejects.toMatchObject({statusCode:404})
  await study.closeStudy(owner,s.id)
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
})
