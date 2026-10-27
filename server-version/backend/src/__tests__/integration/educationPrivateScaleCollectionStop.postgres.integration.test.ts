import {randomUUID} from 'node:crypto'
import express from 'express'
import type {Server} from 'node:http'
import {PrismaClient} from '@prisma/client'
import {afterAll,beforeAll,describe,expect,it,vi} from 'vitest'
import {integrationDatabaseUrl,requireIsolatedReleaseDatabase} from './integration-env'
import {setupPrivateScaleExecutionFixture} from './educationPrivateScaleExecutionFixture'
import {startAssessmentRunExecution} from '../../modules/assessment-run/startExecution'
import {readEducationScaleExecutionSource} from '../../modules/assessment-run/educationScaleExecutionSource'
import {loadFrozenScaleRuntimeSnapshot} from '../../modules/assessment-runtime/runtime-snapshot'
import {assertTrainingScaleCollectionAllowed} from '../../modules/scale/scale-collection-guard'
import {stopCollection} from '../../modules/scale-library-governance/service'
// Actual task/source/actor/child/media allowlists remain real. Only HTTP identity
// transport and external object bytes are synthetic; no fake runtime or FINAL.
vi.mock('../../middleware/auth',()=>({
 authenticateHuiteacher:(req:any,res:any,next:any)=>{if(!req.headers['x-fixture-user'])return res.status(401).end();req.user={userId:req.headers['x-fixture-user'],accountDomain:'SCHOOL',role:'TEACHER',platformRole:'STANDARD'};next()},
 authenticateSchool:(req:any,res:any,next:any)=>{if(!req.headers['x-fixture-user'])return res.status(401).end();req.user={userId:req.headers['x-fixture-user'],accountDomain:'SCHOOL',role:'STUDENT',platformRole:'STANDARD'};next()},
}))
vi.mock('../../modules/assessment-media/assessment-image-delivery',async original=>({
 ...await original<typeof import('../../modules/assessment-media/assessment-image-delivery')>(),
 serveAssessmentImageContent:async({res}:any)=>res.type('image/png').send('synthetic-private-stimulus-bytes'),
}))
import campusCompositeRouter from '../../modules/campus/composite.routes'
import teacherScaleRouter,{listOwnTeacherScaleTasks} from '../../modules/huiteacher/scaleRuntime.routes'
const url=integrationDatabaseUrl('RELEASE_INTEGRATION_DATABASE_URL'),suite=url?describe:describe.skip
let db:PrismaClient,server:Server,base:string
suite('Private exact Scale collection and Teacher media boundaries',()=>{
 beforeAll(async()=>{
  requireIsolatedReleaseDatabase(url!)
  process.env.DATA_ENCRYPTION_KEY||='55'.repeat(32);process.env.DATA_PSEUDONYM_KEY||='56'.repeat(32)
  process.env.CAMPUS_ELIGIBILITY_HMAC_KEY||='57'.repeat(32)
  db=new PrismaClient({datasources:{db:{url:url!}}});await db.$connect()
  const app=express();app.use(express.json());app.use('/teacher',teacherScaleRouter);app.use('/school',campusCompositeRouter)
  app.use((e:any,_req:any,res:any,_next:any)=>res.status(e.statusCode??500).json({code:e.code??'ERROR',message:e.message}))
  server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve))
  base='http://127.0.0.1:'+(server.address() as {port:number}).port
 })
 afterAll(async()=>{if(server)await new Promise<void>(resolve=>server.close(()=>resolve()));await db?.$disconnect()})
 it.each(['SCHOOL','TEACHER'] as const)('%s exact private source stops fresh START while an already-started FINAL completes under frozen rules',async product=>{
  const f=await setupPrivateScaleExecutionFixture(db,product,'SELF',2)
  const executions=await f.executions();expect(executions).toHaveLength(2)
  const actorUserId=f.participantUserId,headers={'x-fixture-user':actorUserId}
  await expect(startAssessmentRunExecution({executionId:executions[0].id,actorUserId:f.managerUserId})).rejects.toMatchObject({code:'RUN_EXECUTION_ACTOR'})
  let started
  if(product==='TEACHER'){
   const tasks=await listOwnTeacherScaleTasks(actorUserId)
   expect(tasks.list.filter(t=>t.runId===f.runId)).toHaveLength(2)
   expect(tasks.list.find(t=>t.executionId===executions[0].id)?.resourceKey).toMatch(/^private-scale:TEACHER:/)
   const response=await fetch(`${base}/teacher/run-executions/${executions[0].id}/start-scale`,{method:'POST',headers})
   expect(response.status).toBe(200);started=(await response.json()).data
  }else started=await startAssessmentRunExecution({executionId:executions[0].id,actorUserId})
  expect(started).toMatchObject({state:'STARTED',runtimeBindingKind:'COMPOSITE'})
  const parent=await db.compositeAssessmentAttempt.findUniqueOrThrow({where:{id:started.runtimeBindingRef}})
  const children=await db.assessment.findMany({where:{compositeAttemptId:parent.id,attemptEpoch:parent.attemptEpoch}})
  expect(children).toHaveLength(1);const child=children[0]
  if(!child.runtimeSnapshotEncrypted||!child.compositeItemId)throw new Error('Actual START must freeze the exact child')
  const frozen=await loadFrozenScaleRuntimeSnapshot(child.runtimeSnapshotEncrypted,db)
  const [track]=await db.$queryRaw<Array<{key:string;version:string}>>`SELECT resource_key AS key,resource_version AS version FROM assessment_run_tracks WHERE id=${f.track.id}`
  const source=await readEducationScaleExecutionSource(db,{product,organizationId:f.organizationId,resourceKey:track.key,resourceVersion:track.version,purpose:'HISTORY'})
  if(source.sourceKind!=='AUTHOR_PRIVATE')throw new Error('Expected an exact author-private resource')
  expect(source.compositeItemId).toBe(child.compositeItemId)
  if(product==='TEACHER'){
   const media=`${base}/teacher/composite-attempts/${parent.id}/items/${child.compositeItemId}/scale/assets/`
   const image=await fetch(media+f.stimulus.assetId+'/content',{headers})
   expect(image.status).toBe(200);expect(await image.text()).toBe('synthetic-private-stimulus-bytes')
   const reportImage=await fetch(media+f.reportImage.assetId+'/content',{headers})
   expect(reportImage.status).toBe(400)
   expect((await reportImage.json()).message).toBe('Assessment image is not referenced by the frozen Scale runtime')
   expect((await fetch(media+f.stimulus.assetId+'/content',{headers:{'x-fixture-user':f.managerUserId}})).status).toBe(404)
   expect((await fetch(`${base}/teacher/composite-attempts/${parent.id}/items/${randomUUID()}/scale/assets/${f.stimulus.assetId}/content`,{headers})).status).toBe(404)
  }
  const entry=product==='TEACHER'?'teacher':'school',attemptUrl=`${base}/${entry}/composite-attempts/${parent.id}`
  const compact=await fetch(attemptUrl+'?view=current-unit',{headers});expect(compact.status).toBe(200)
  expect((await compact.json()).data).toMatchObject({id:parent.id,currentItem:{id:child.compositeItemId}})
  expect((await fetch(attemptUrl+'?view=current-unit',{headers:{'x-fixture-user':f.managerUserId}})).status).toBe(404)
  await db.$transaction(tx=>stopCollection(tx,f.libraryAdminUserId,'RELEASE',source.origin.releaseId,'Synthetic private Scale exact release stop'))
  await expect(startAssessmentRunExecution({executionId:executions[1].id,actorUserId})).rejects.toThrow('紧急停用')
  const [unstarted]=await db.$queryRaw<Array<{status:string;runtimeBindingRef:string|null}>>`SELECT status,runtime_binding_ref AS "runtimeBindingRef" FROM assessment_run_executions WHERE id=${executions[1].id}`
  expect(unstarted).toMatchObject({status:'ASSIGNED',runtimeBindingRef:null})
  // The exact release stop blocks new admission only; the server-established
  // attempt finishes under its frozen runtime and persists its facts.
  // A caller-supplied parent/item or another actor cannot borrow this exemption.
  await expect(db.$transaction(tx=>assertTrainingScaleCollectionAllowed(tx,[child.scaleId],{
   compositeAttemptId:parent.id,compositeItemIds:[randomUUID()],compositeAttemptEpoch:parent.attemptEpoch,
  }))).rejects.toThrow('紧急停用')
  expect((await fetch(attemptUrl+'?view=current-unit',{headers})).status).toBe(200)
  const submission={submissionId:randomUUID(),attemptEpoch:child.attemptEpoch,definitionHash:frozen.legacyDefinitionHash,contextSnapshotHash:parent.contextSnapshotHash,answers:f.answers}
  const submit=()=>fetch(attemptUrl+`/items/${child.compositeItemId}/scale/submit?response=receipt`,{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify(submission)})
  expect((await fetch(attemptUrl+`/items/${child.compositeItemId}/scale/submit?response=receipt`,{method:'POST',headers:{'x-fixture-user':f.managerUserId,'Content-Type':'application/json'},body:JSON.stringify(submission)})).status).toBe(404)
  expect((await db.assessment.findUniqueOrThrow({where:{id:child.id}})).status).toBe('IN_PROGRESS')
  const submitted=await submit(),submittedBody=await submitted.json();expect(submitted.status,JSON.stringify({...submittedBody,childState:(await db.assessment.findUniqueOrThrow({where:{id:child.id}})).status})).toBe(200);const receipt=submittedBody.data
  expect(receipt).toMatchObject({submissionId:submission.submissionId,completed:true,replayed:false})
  for(const field of ['result','scores','report','answers'])expect(receipt).not.toHaveProperty(field)
  const replay=await submit();expect(replay.status).toBe(200);expect((await replay.json()).data).toMatchObject({submissionId:submission.submissionId,payloadHash:receipt.payloadHash,completed:true,replayed:true})
  const retained=await db.assessment.findUniqueOrThrow({where:{id:child.id}})
  expect(retained.status).toBe('COMPLETED');expect(retained.submissionId).toBeTypeOf('string')
  expect(await db.assessmentUnitSnapshot.count({where:{compositeAttemptId:parent.id,attemptEpoch:child.attemptEpoch,terminalState:'COMPLETED'}})).toBeGreaterThan(0)
 },60_000)
})
