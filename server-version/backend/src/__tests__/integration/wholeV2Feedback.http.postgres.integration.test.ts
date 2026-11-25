import { randomUUID } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { performance } from 'node:perf_hooks'
import express from 'express'
import type { Server } from 'node:http'
import { afterAll,beforeAll,describe,expect,it,vi } from 'vitest'
import { prisma } from '../../config/database'
import { integrationDatabaseUrl,requireIsolatedReleaseDatabase } from './integration-env'
import { setupSchoolCompositionExecution,setupTeacherCompositionExecution } from './educationPrivateCompositionExecutionFixture'
import { createTeacherAssessmentRuntimeRouter } from '../../modules/huiteacher/assessmentRuntime.routes'
import { teacherAssessmentRuntimeSource } from '../../modules/huiteacher/assessmentRuntime.source'
import activityRunRouter from '../../modules/campus/activity.run.routes'
import compositeRouter from '../../modules/campus/composite.routes'
import { csrfProtection } from '../../middleware/csrf'
import { generateToken } from '../../utils/jwt'
import { authorizeEducationWholeV2 } from '../../modules/composite/whole-v2.access'
import { readOrdinarySelfWholeAccess } from '../../modules/assessment-run/ordinarySelfWholeAccess'
import { readCompositeFinalFacts,readCompositeFinalRawBatch } from '../../modules/assessment-runtime/composite-final.reader'
import { SCHOOL_AUTH_COOKIE_NAME,SCHOOL_CSRF_COOKIE_NAME,HUITEACHER_AUTH_COOKIE_NAME,HUITEACHER_CSRF_COOKIE_NAME,CSRF_HEADER_NAME } from '../../utils/authCookies'

const url=integrationDatabaseUrl('RELEASE_INTEGRATION_DATABASE_URL'),suite=url?describe:describe.skip
suite('real education V2 HTTP submit -> direct feedback',()=>{
 let server:Server,base:string
 beforeAll(async()=>{
  requireIsolatedReleaseDatabase(url!)
  for(const key of ['COMPOSITE_WHOLE_V2_ENABLED','ASSESSMENT_REPORT_ASYNC_ENABLED','ASSESSMENT_WHOLE_SUBMIT_ENABLED','ASSESSMENT_COMPACT_FACTS_ENABLED','ASSESSMENT_SHARED_CONTROL_ENABLED'])vi.stubEnv(key,'true')
  process.env.CAMPUS_ELIGIBILITY_HMAC_KEY||='c'.repeat(64)
  const app=express();app.use(express.json());app.use('/api',csrfProtection)
  app.use('/api/campus',activityRunRouter,compositeRouter)
  app.use('/api/huiteacher',createTeacherAssessmentRuntimeRouter(teacherAssessmentRuntimeSource))
  app.use((error:any,_req:any,res:any,_next:any)=>res.status(error.statusCode??500).json({code:error.code,message:error.message}))
  server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));base='http://127.0.0.1:'+(server.address() as {port:number}).port
 },60000)
 afterAll(async()=>{
  vi.restoreAllMocks();vi.unstubAllEnvs()
  if(server){server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()))}
  await (await import('../../config/queue')).closeQueues(true);await prisma.$disconnect()
 })
 it.each(['SCHOOL','TEACHER'] as const)('%s joins FINAL feedback and reuses the ordinary authorization proof',async product=>{
  const school=product==='SCHOOL'
  const f=await (school?setupSchoolCompositionExecution:setupTeacherCompositionExecution)(prisma,{scaleOnly:true,provideParticipantReport:true})
  const user=await prisma.user.findUniqueOrThrow({where:{id:f.participantUserId}}),csrf='synthetic-v2-csrf'
  const token=generateToken({userId:user.id,username:user.username,role:user.role,tokenVersion:user.tokenVersion,accountDomain:'SCHOOL',mfaVerifiedAt:Math.floor(Date.now()/1000),...(!school?{sessionProduct:'HUITEACHER' as const}:{})})
  const auth={'content-type':'application/json',cookie:`${school?SCHOOL_AUTH_COOKIE_NAME:HUITEACHER_AUTH_COOKIE_NAME}=${token}; ${school?SCHOOL_CSRF_COOKIE_NAME:HUITEACHER_CSRF_COOKIE_NAME}=${csrf}`,[CSRF_HEADER_NAME]:csrf}
  const prefix=base+(school?'/api/campus':'/api/huiteacher')
  const request=async(path:string,body?:unknown)=>{
   const res=await fetch(prefix+path,{headers:auth,...(body!==undefined?{method:'POST',body:JSON.stringify(body)}:{})})
   const value:any=await res.json();return {status:res.status,value,data:value.data}
  }
  const executionPath=school?`/organizations/${f.organizationId}/activities/${f.workflow.id}/runs/${f.runId}/executions/${f.executionId}`:`/run-executions/${f.executionId}`
  const started=await request(executionPath+(school?'/start':'/start-assessment'),{})
  expect(started.status,JSON.stringify(started.value)).toBe(200)
  const attemptId=started.data.runtimeBindingRef
  const parent=await prisma.compositeAssessmentAttempt.findUniqueOrThrow({where:{id:attemptId}})
  expect(parent.publicationHash).toMatch(/^[a-f0-9]{64}$/)
  expect(parent.receiptOnly).toBe(false)
  expect(await prisma.assessment.count({where:{compositeAttemptId:attemptId}})).toBe(0)
  const proof=await readOrdinarySelfWholeAccess(prisma,product,user.id,{attemptId})
  expect(proof?.wholeV2Authorization).toMatchObject({id:attemptId,userId:user.id})
  expect(new Date(String(proof?.wholeV2Authorization?.startedAt)).getTime()).toBe(parent.startedAt.getTime())
  const spy=vi.spyOn(prisma,'$queryRaw')
  const authorized=await authorizeEducationWholeV2({params:{attemptId},user:{userId:user.id}} as any,{locals:{ordinarySelfWhole:proof}} as any)
  const authorizationQueries=spy.mock.calls.map(([q]:any)=>q.strings?.join('?')??'')
  expect(authorizationQueries.some((q:string)=>q.includes('ca.creation_key AS "creationKey"')&&q.includes('WHERE p.id ='))).toBe(false)
  spy.mockClear()
  const mismatched={...proof,wholeV2Authorization:{...proof?.wholeV2Authorization,userId:randomUUID()}}
  const fallback=await authorizeEducationWholeV2({params:{attemptId},user:{userId:user.id}} as any,{locals:{ordinarySelfWhole:mismatched}} as any)
  expect(fallback.attempt.id).toBe(attemptId)
  expect(spy.mock.calls.some(([q]:any)=>(q.strings?.join('?')??'').includes('ca.creation_key AS "creationKey"'))).toBe(true)
  spy.mockRestore()
  const payload={submissionId:randomUUID(),attemptEpoch:parent.attemptEpoch,publicationHash:authorized.plan.publicationHash,slotSetHash:authorized.plan.slotSetHash,
   units:Object.fromEntries(authorized.plan.slots.map(slot=>{
    if(slot.unitType!=='SCALE')throw Error('Expected frozen scales')
    return [slot.slotKey,{unitType:'SCALE',definitionHash:slot.definitionHash,answers:slot.definition.items.map(item=>({itemCode:item.itemCode,responseValue:slot.definition.responseSets[0].options[0].value}))}]
   }))}
  const path=(school?'/composite-attempts/':'/assessment-composite-attempts/')+attemptId+'/v2/whole/submit'
  const done=await request(path,payload)
  expect(done.status,JSON.stringify(done.value)).toBe(200)
  expect(done.data).toMatchObject({status:'COMPLETED',replayed:false,feedbackAvailable:true})
  // No /whole/progress request precedes this real feedback page request.
  const feedbackPath='/run-executions/'+f.executionId+'/feedback'
  const feedback=await request(feedbackPath)
  expect(feedback.status,JSON.stringify(feedback.value)).toBe(200)
  expect(feedback.data.state).toBe('READY')
  expect(feedback.data.units.map((u:any)=>u.state)).toEqual(['READY','WITHHELD'])
  expect(JSON.stringify(feedback.data)).not.toMatch(/PRIVATE NONE BLOCK FEEDBACK|_v2Verify/)
  const [execution]=await prisma.$queryRaw<Array<{status:string;assignmentStatus:string}>>`SELECT e.status,a.status AS "assignmentStatus" FROM assessment_run_executions e JOIN relational_assessment_assignments a ON a.id=e.relational_assignment_id WHERE e.id=${f.executionId}`
  expect(execution).toEqual({status:'COMPLETED',assignmentStatus:'COMPLETED'})
  expect(await prisma.compositeReportJob.count({where:{attemptId}})).toBe(0)
  const facts=await readCompositeFinalFacts(prisma,{attemptId,attemptEpoch:1})
  expect(Object.keys(facts!.facts.units)).toHaveLength(2)
  const raw=await readCompositeFinalRawBatch(prisma,[{attemptId,attemptEpoch:1}])
  expect(raw.size).toBe(1)
  expect((await request(path,payload)).data.replayed).toBe(true)
  expect((await request(path,{...payload,units:{}})).status).toBe(409)

  if(process.env.WHOLE_V2_FEEDBACK_EVIDENCE){
   const samples:any[]=[],tasks:Promise<void>[]=[],start=performance.now()+50
   for(let i=0;i<900;i++){
    await new Promise(r=>setTimeout(r,Math.max(0,start+i*1000/30-performance.now())))
    tasks.push((async()=>{const began=performance.now();const result=await request(feedbackPath);samples.push({ms:performance.now()-began,status:result.status,state:result.data?.state})})())
   }
   await Promise.all(tasks)
   const sorted=samples.map(s=>s.ms).sort((a,b)=>a-b)
   writeFileSync(process.env.WHOLE_V2_FEEDBACK_EVIDENCE+'-'+product+'.json',JSON.stringify({scope:'Real signed-in HTTP feedback, frozen 2-scale SELF questionnaire, one completed attempt, no progress poll',rate:30,seconds:30,count:samples.length,success:samples.filter(s=>s.status===200&&s.state==='READY').length,p50:sorted[449],p95:sorted[854],p99:sorted[890],max:sorted.at(-1),samples},null,2))
   expect(samples.filter(s=>s.status===200&&s.state==='READY')).toHaveLength(900)
  }
  await prisma.organizationAccessDeny.create({data:{id:randomUUID(),organizationId:f.organizationId,userId:user.id,permission:'REPORT_READ',reason:'Synthetic feedback revocation',deniedByUserId:f.managerUserId}})
  expect((await request(feedbackPath)).status).toBe(404)
 },180000)
})
