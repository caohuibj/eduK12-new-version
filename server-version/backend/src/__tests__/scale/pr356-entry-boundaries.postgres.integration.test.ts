import {randomUUID} from 'node:crypto'
import {createServer,type Server} from 'node:http'
import {afterAll,beforeAll,describe,expect,it} from 'vitest'
const suite=process.env.PR356_ENTRY_BOUNDARIES_ISOLATED==='1'?describe:describe.skip
suite('PR356 actual product entry and admitted standalone epoch',()=>{
 let db:any,server:Server,base:string,system:any,school:any,teacher:any,training:any,newTraining:any,source:any,scaleId:string,accepted:any
 beforeAll(async()=>{
  const u=new URL(process.env.DATABASE_URL!)
  if(process.env.NODE_ENV!=='test'||!['localhost','127.0.0.1'].includes(u.hostname)||u.port!=='55439'||!/^\/pr356_entry_test_[a-f0-9]{10}$/.test(u.pathname))throw new Error('Dedicated fresh synthetic entry-boundary DB required')
  db=(await import('../../config/database')).prisma
  if(await db.user.count()||await db.scale.count())throw new Error('Fresh schema only; no shared fixture reset')
  const make=(name:string,accountDomain='TRAINING',role='STUDENT',platformRole='STANDARD')=>db.user.create({data:{username:'entry-'+name+'-'+randomUUID(),passwordHash:'SYNTHETIC ONLY',accountDomain,role,platformRole,teacherApproved:role==='TEACHER'}})
  system=await make('system','TRAINING','STUDENT','SYSTEM_ADMIN');school=await make('school','SCHOOL');teacher=await make('teacher','SCHOOL','TEACHER');training=await make('admitted');newTraining=await make('new')
  const registry=await import('../../modules/scale/onboarding/instrument-registry'),key='academic_self_concept_biology_zh_cn',version='1.0.0'
  source=registry.getScaleInstrumentSource(key,version)!
  const policy=registry.getScaleInstrumentRuntimePolicy(key,version)!
  const installed=await (await import('../../modules/scale/onboarding/install')).installScaleInstrument(db,{instrumentKey:key,instrumentVersion:version,actorUserId:system.id,deploymentPolicy:{schemaVersion:2,revision:1,locale:'zh-CN',territory:source.scientificReview?.territory??'ZZ',deploymentModes:['STANDALONE','COMPOSITE','QUESTIONNAIRE'],runtimePolicyHash:policy.runtimePolicyHash,localizationVersion:version,inFlightCompletion:'FROZEN_DEADLINE'}})
  scaleId=installed.scaleId!
  const publish=await import('../../modules/scale/onboarding/publish'),input={instrumentKey:key,instrumentVersion:version,actorUserId:system.id,visibility:'PUBLIC' as const,allowedProducts:['TRAINING' as const]}
  const plan=await publish.planStandardScalePublication(db,input);expect(plan.blockers).toEqual([]);await publish.publishStandardScale(db,{...input,expectedProofHash:plan.proofHash})
  const express=(await import('express')).default,app=express();app.use(express.json())
  app.use(async(req:any,_res:any,next:any)=>{const user=await db.user.findUniqueOrThrow({where:{id:String(req.headers['x-synthetic-principal'])}});req.user={userId:user.id,role:user.role,accountDomain:user.accountDomain};next()})
  app.post('/scales/:scaleId/assessments',(await import('../../modules/scale/scale-start.controller')).startStandaloneScaleAssessment)
  app.use((await import('../../middleware/errorHandler')).errorHandler)
  server=createServer(app);await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));base='http://127.0.0.1:'+(server.address() as {port:number}).port
  const start=await request(training);expect(start.status,start.body.message).toBe(200);accepted=start.body.data
  // Formal publication is the existing audited product-scope change; no direct
  // policy UPDATE, fabricated ONLINE state or role mutation is used here.
  const change={...input,allowedProducts:['SURVEY' as const]};const next=await publish.planStandardScalePublication(db,change)
  expect(next.blockers).toEqual([]);await publish.publishStandardScale(db,{...change,expectedProofHash:next.proofHash})
 },120000)
 afterAll(async()=>{if(server)await new Promise<void>(r=>server.close(()=>r()));if(db){await (await import('../../config/queue')).closeQueues(true);await db.$disconnect()}})
 async function request(user:any){const response=await fetch(base+'/scales/'+scaleId+'/assessments',{method:'POST',headers:{'Content-Type':'application/json','x-synthetic-principal':user.id},body:JSON.stringify({context:{gradeLevel:'7'}})});return {status:response.status,body:await response.json() as any}}
 it('does not apply a stopped Training entry to valid School/Teacher starts, while new Training stays blocked',async()=>{
  for(const actor of [school,teacher]){const start=await request(actor);expect(start.status,start.body.message).toBe(200);expect(start.body.data.assessment.id).toBeTruthy()}
  const blocked=await request(newTraining);expect(blocked.status).not.toBe(200);expect(await db.assessment.count({where:{userId:newTraining.id}})).toBe(0)
 },60000)
 it('resumes and commits the admitted Training epoch after entry withdrawal without bypassing replay identity',async()=>{
  const resumed=await request(training);expect(resumed.status,resumed.body.message).toBe(200);expect(resumed.body.data.assessment.id).toBe(accepted.assessment.id)
  const child=await db.assessment.findUniqueOrThrow({where:{id:accepted.assessment.id},include:{scale:true}})
  const submit=(await import('../../modules/scale/unified-final-submit.service')).submitUnifiedScaleAssessmentFinal
  const input={assessmentId:child.id,userId:training.id,submissionId:randomUUID(),attemptEpoch:child.attemptEpoch,definitionHash:accepted.scale.definitionHash,contextSnapshotHash:accepted.assessment.contextSnapshotHash??null,answers:source.executable.goldenCases[0].answers}
  const result=await submit(input,child);expect(result.replayed).toBe(false)
  const stored=await db.assessment.findUniqueOrThrow({where:{id:child.id},include:{scale:true}});expect(stored.status).toBe('COMPLETED')
  expect((await submit(input,stored)).replayed).toBe(true)
 },60000)
})
