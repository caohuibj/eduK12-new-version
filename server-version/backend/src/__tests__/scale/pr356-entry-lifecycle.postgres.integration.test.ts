/** Local retained-fixture continuation only. Does not replay initial START/FINAL
 * acceptance cases or reset lifecycle state. Every mutation is synthetic. */
import {randomUUID} from 'node:crypto'
import {createServer,type Server} from 'node:http'
import {afterAll,describe,expect,it} from 'vitest'
const suite=process.env.PR356_ENTRY_LIFECYCLE_ISOLATED==='1'?describe:describe.skip
suite('retained PR356 entry fixture: missing restart and emergency boundaries',()=>{
 let db:any,server:Server
 afterAll(async()=>{if(server)await new Promise<void>(resolve=>server.close(()=>resolve()));if(db){await (await import('../../config/queue')).closeQueues(true);await db.$disconnect()}})
 it('keeps restart as new entry and retains shared emergency-stop collection policy',async()=>{
  const u=new URL(process.env.DATABASE_URL!)
  if(process.env.NODE_ENV!=='test'||!['localhost','127.0.0.1'].includes(u.hostname)||u.port!=='55439'||!/^\/pr356_entry_test_[a-f0-9]{10}$/.test(u.pathname))throw new Error('Dedicated retained synthetic entry DB required')
  db=(await import('../../config/database')).prisma
  if(await db.user.count()!==5||await db.scale.count()!==1)throw new Error('Exact retained five-user/one-scale fixture required; never reset a fixture')
  const actor=async(name:string)=>db.user.findFirstOrThrow({where:{username:{startsWith:'entry-'+name+'-'}}})
  const system=await actor('system'),teacher=await actor('teacher'),newTraining=await actor('new')
  expect(system.platformRole).toBe('SYSTEM_ADMIN');expect(teacher.accountDomain).toBe('SCHOOL');expect(teacher.role).toBe('TEACHER')
  const scale=await db.scale.findFirstOrThrow(),key='academic_self_concept_biology_zh_cn',version='1.0.0'
  expect(scale.code).toBe(key);expect(scale.instrumentVersion).toBe(version)
  expect(await db.assessment.count({where:{userId:newTraining.id}})).toBe(0)
  const completedBefore=await db.assessment.count({where:{status:'COMPLETED'}});expect(completedBefore).toBe(1)
  const source=(await import('../../modules/scale/onboarding/instrument-registry')).getScaleInstrumentSource(key,version)!
  const publish=await import('../../modules/scale/onboarding/publish')
  const setEntry=async(allowedProducts:Array<'TRAINING'|'SURVEY'>)=>{
   const input={instrumentKey:key,instrumentVersion:version,actorUserId:system.id,visibility:'PUBLIC' as const,allowedProducts}
   const plan=await publish.planStandardScalePublication(db,input);expect(plan.blockers).toEqual([])
   await publish.publishStandardScale(db,{...input,expectedProofHash:plan.proofHash})
  }
  const restart=(await import('../../modules/scale/scale-restart.service')).restartStandaloneScaleAssessmentWithPolicy
  const priorTeacher=await db.assessment.findFirstOrThrow({where:{userId:teacher.id,status:'IN_PROGRESS'}})
  const nextTeacher=await restart(priorTeacher.id,teacher.id)
  expect(nextTeacher.id).not.toBe(priorTeacher.id);expect(nextTeacher.attemptEpoch).toBe(priorTeacher.attemptEpoch+1)
  expect((await db.assessment.findUniqueOrThrow({where:{id:priorTeacher.id}})).status).toBe('ABANDONED')
  const express=(await import('express')).default,app=express();app.use(express.json())
  app.use(async(req:any,_res:any,next:any)=>{try{const current=await db.user.findUniqueOrThrow({where:{id:String(req.headers['x-synthetic-principal'])}});req.user={userId:current.id,role:current.role,accountDomain:current.accountDomain};next()}catch(error){next(error)}})
  app.post('/scales/:scaleId/assessments',(await import('../../modules/scale/scale-start.controller')).startStandaloneScaleAssessment)
  app.use((await import('../../middleware/errorHandler')).errorHandler)
  server=createServer(app);await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+(server.address() as {port:number}).port
  const start=async(user:any)=>{const response=await fetch(base+'/scales/'+scale.id+'/assessments',{method:'POST',headers:{'Content-Type':'application/json','x-synthetic-principal':user.id},body:JSON.stringify({context:{gradeLevel:'7'}})});return {status:response.status,body:await response.json() as any}}
  await setEntry(['TRAINING'])
  const admitted=await start(newTraining);expect(admitted.status,admitted.body.message).toBe(200)
  await setEntry(['SURVEY'])
  await expect(restart(admitted.body.data.assessment.id,newTraining.id)).rejects.toThrow('未获本入口准入')
  expect((await db.assessment.findUniqueOrThrow({where:{id:admitted.body.data.assessment.id}})).status).toBe('IN_PROGRESS')
  await expect(restart(nextTeacher.id,newTraining.id)).rejects.toMatchObject({statusCode:403})
  expect((await db.assessment.findUniqueOrThrow({where:{id:nextTeacher.id}})).status).toBe('IN_PROGRESS')
  await db.$transaction(async(tx:any)=>(await import('../../modules/scale-library-governance/service')).stopCollection(tx,system.id,'TRAINING_SCALE',scale.id,'Synthetic PR356 explicit emergency policy'))
  const lateSchool=await db.user.create({data:{username:'entry-emergency-school-'+randomUUID(),passwordHash:'SYNTHETIC ONLY',accountDomain:'SCHOOL',role:'STUDENT'}})
  const stopped=await start(lateSchool);expect(stopped.status).not.toBe(200);expect(stopped.body.message).toContain('紧急停用')
  expect(await db.assessment.count({where:{userId:lateSchool.id}})).toBe(0)
  const admission=await (await import('../../modules/scale/scale-admission.service')).loadStoredScaleAdmission(nextTeacher as any)
  const runtime=await (await import('../../modules/scale/scale-admission.service')).loadScaleAdmissionRuntime(nextTeacher as any)
  const input={assessmentId:nextTeacher.id,userId:teacher.id,submissionId:randomUUID(),attemptEpoch:nextTeacher.attemptEpoch,definitionHash:runtime.legacyDefinitionHash,contextSnapshotHash:admission?.contextSnapshotHash??null,answers:source.executable!.goldenCases[0].answers}
  await expect((await import('../../modules/scale/unified-final-submit.service')).submitUnifiedScaleAssessmentFinal(input,nextTeacher as any)).rejects.toThrow('紧急停用')
  expect((await db.assessment.findUniqueOrThrow({where:{id:nextTeacher.id}})).status).toBe('IN_PROGRESS')
  expect(await db.assessment.count({where:{status:'COMPLETED'}})).toBe(completedBefore)
 },120000)
})
