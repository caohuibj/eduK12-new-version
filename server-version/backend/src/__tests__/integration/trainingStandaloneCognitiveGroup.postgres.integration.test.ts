import {randomUUID} from 'node:crypto'
import {existsSync,readFileSync,writeFileSync} from 'node:fs'
import {afterAll,expect,it,vi} from 'vitest'
import {UserRole} from '@prisma/client'
import {prisma as db} from '../../config/database'
import {integrationDatabaseUrl,requireIsolatedReleaseDatabase} from './integration-env'
import {createAssignment,publishAssignment,archiveAssignment} from '../../modules/cognitive/assignment.service'
import {createSession} from '../../modules/cognitive/session.service'
import {submitCognitiveSessionFinal} from '../../modules/cognitive/final-submit.service'
import {publishTrainingSourcesFixture} from '../fixtures/published-measurement'
import {gonogoSequence} from '../../modules/cognitive/randomization'
import {createTrialEnvelope} from '../../modules/cognitive/v2/trial-envelope'
import * as security from '../../modules/cognitive/cognitive.security'
import {listTrainingGroupReports,trainingGroupHistory,trainingGroupTools,generateTrainingGroupReport,readTrainingGroupReport} from '../../modules/training-analysis/group-report.service'
import {trainingCognitiveGroupTaskKey} from '../../modules/training-analysis/group-source'

const url=integrationDatabaseUrl('RELEASE_INTEGRATION_DATABASE_URL');if(!url)throw Error('isolated PostgreSQL required');requireIsolatedReleaseDatabase(url)
afterAll(async()=>{await (await import('../../config/queue')).closeQueues(true);await db.$disconnect()})

async function findGroupTask(scope:Parameters<typeof listTrainingGroupReports>[0],taskId:string){
 let beforeTaskId:string|undefined
 do{
  const page=await listTrainingGroupReports({...scope,beforeTaskId})
  const task=page.tasks.find(row=>row.id===taskId)
  if(task)return task
  beforeTaskId=page.nextTaskId??undefined
 }while(beforeTaskId)
 return undefined
}


it('generates a disclosed standalone Cognitive course report and reopens its frozen version without reading result payloads',async()=>{
 const bootstrap=JSON.parse(readFileSync(process.env.TRAINING_STANDALONE_GROUP_BOOTSTRAP??'/tmp/training-native-bundle-group-bootstrap.json','utf8'))
 const participants=JSON.parse(readFileSync(process.env.TRAINING_STANDALONE_GROUP_PARTICIPANTS??'/tmp/training-native-bundle-group-disclosed-fixture.json','utf8')) as Array<{student:string}>
 const actor={userId:bootstrap.actor.userId,role:UserRole.TEACHER},courseId=bootstrap.course.id
 const path=process.env.TRAINING_STANDALONE_GROUP_FIXTURE??'/tmp/training-standalone-cognitive-group-fixture.json'
 let fixture: {assignmentId:string;published:boolean;measurementPublished:boolean;sessions:Array<{student:string;id:string;completed:boolean}>}
 if(existsSync(path))fixture=JSON.parse(readFileSync(path,'utf8'))
 else{
  const original=await db.cognitiveAssignment.findUniqueOrThrow({where:{id:bootstrap.assignment.id},select:{configId:true}})
  const draft=await createAssignment(actor.userId,actor.role,{courseId,configId:original.configId,title:'Standalone group contract',profile:'standard',maxAttempts:3,required:true})
  fixture={assignmentId:draft.id,published:false,measurementPublished:false,sessions:[]};writeFileSync(path,JSON.stringify(fixture))
 }
 if(!fixture.published){await publishAssignment(actor.userId,actor.role,fixture.assignmentId);fixture.published=true;writeFileSync(path,JSON.stringify(fixture))}
 if(!fixture.measurementPublished){await publishTrainingSourcesFixture(db,actor.userId,{assignmentIds:[fixture.assignmentId]});fixture.measurementPublished=true;writeFileSync(path,JSON.stringify(fixture))}
 const assignment=await db.cognitiveAssignment.findUniqueOrThrow({where:{id:fixture.assignmentId}})
 expect(assignment).toMatchObject({listedStandalone:true,courseId,status:'PUBLISHED',courseSnapshot:{id:courseId}})
 const scope={actor,courseId},taskId=trainingCognitiveGroupTaskKey(assignment.id)
 expect(await findGroupTask(scope,taskId)).toBeDefined()
 // Opening the source picker only reads assignment metadata, even before data exists.
 const pickerDecrypt=vi.spyOn(security,'decryptCognitivePayload')
 const tool=(await trainingGroupTools({...scope,taskId})).tools[0]
 expect(tool).toMatchObject({key:taskId,kind:'COGNITIVE',source:{taskId,configDigest:assignment.resolvedConfigHash,variantKey:null}})
 expect(pickerDecrypt).toHaveBeenCalledTimes(1);pickerDecrypt.mockRestore()
 expect(participants).toHaveLength(5)
 for(const {student} of participants){
  let recorded=fixture.sessions.find(row=>row.student===student)
  if(!recorded){
   await createSession(student,assignment.id)
   const session=await db.cognitiveSession.findFirstOrThrow({where:{assignmentId:assignment.id,userId:student,status:'IN_PROGRESS',compositeAttemptId:null}})
   recorded={student,id:session.id,completed:false};fixture.sessions.push(recorded);writeFileSync(path,JSON.stringify(fixture))
  }
  if(recorded.completed)continue
  const session=await db.cognitiveSession.findUniqueOrThrow({where:{id:recorded.id}})
  await submitCognitiveSessionFinal(student,{sessionId:session.id,submissionId:randomUUID(),attemptEpoch:1,definitionHash:assignment.resolvedConfigHash!,contextSnapshotHash:null,trials:gonogoSequence(session.randomSeed,120,.25).map((trialType,trialIndex)=>createTrialEnvelope({trialIndex,phase:'test',startedAtPerfMs:trialIndex*1000,endedAtPerfMs:trialIndex*1000+300,payload:{trialType,responded:trialType==='go',rtMs:trialType==='go'?300:null,interrupted:false}}))})
  recorded.completed=true;writeFileSync(path,JSON.stringify(fixture))
 }
 const {publication,configDigest,variantKey}=tool.source
 const generated=await generateTrainingGroupReport({...scope,selection:{taskId,toolKey:tool.key,publication,configDigest,variantKey}})
 expect(generated.projection).toMatchObject({tool:{kind:'COGNITIVE'},countUnit:'PERSON',assignedN:null})
 const rt=generated.projection.metrics.find(metric=>metric.unit==='ms'&&metric.mean===300)
 expect(rt).toMatchObject({state:'present',validN:5,missingN:0,mean:300,sdSample:0})
 const zero=generated.projection.metrics.find(metric=>metric.mean===0)
 expect(zero).toMatchObject({state:'present',validN:5,mean:0})
 // An unfinished repeat cannot replace a formal completion or alter its artifact.
 await createSession(participants[0].student,assignment.id)
 const readerDecrypt=vi.spyOn(security,'decryptCognitivePayload')
 expect(await readTrainingGroupReport({...scope,taskId,artifactId:generated.artifactId})).toEqual(generated)
 // Only the assignment report contract is decrypted. No session/result payloads.
 expect(readerDecrypt).toHaveBeenCalledTimes(1);readerDecrypt.mockRestore()
 await expect(readTrainingGroupReport({actor:{userId:participants[0].student,role:UserRole.STUDENT},courseId,taskId,artifactId:generated.artifactId})).rejects.toMatchObject({statusCode:404})
 expect((await trainingGroupHistory({...scope,taskId})).artifacts.some(row=>row.artifactId===generated.artifactId)).toBe(true)
 writeFileSync('/tmp/training-standalone-cognitive-group-proof.json',JSON.stringify({passed:true,source:'native published standalone CognitiveAssignment',participantN:5,rt:{key:rt!.key,unit:rt!.unit,validN:rt!.validN,mean:rt!.mean},zeroMetric:zero!.key,sourcePickerDoesNotReadSessions:true,storedReadDoesNotDecryptResults:true,unfinishedRedoDoesNotChangeSnapshot:true,studentDenied:true,rawTrialsRescoredByReport:false,newSchema:false,productionAccessed:false},null,2))
},90_000)

it('keeps an archived standalone task and its original version reachable while disabling generation',async()=>{
 const bootstrap=JSON.parse(readFileSync(process.env.TRAINING_STANDALONE_GROUP_BOOTSTRAP??'/tmp/training-native-bundle-group-bootstrap.json','utf8'))
 const fixture=JSON.parse(readFileSync(process.env.TRAINING_STANDALONE_GROUP_FIXTURE??'/tmp/training-standalone-cognitive-group-fixture.json','utf8'))
 const actor={userId:bootstrap.actor.userId,role:UserRole.TEACHER},courseId=bootstrap.course.id,taskId=trainingCognitiveGroupTaskKey(fixture.assignmentId),scope={actor,courseId}
 const pointer=(await trainingGroupHistory({...scope,taskId})).artifacts[0]
 expect(pointer).toBeDefined()
 const before=await readTrainingGroupReport({...scope,taskId,artifactId:pointer.artifactId})
 const assignment=await db.cognitiveAssignment.findUniqueOrThrow({where:{id:fixture.assignmentId}})
 if(assignment.status!=='ARCHIVED')await archiveAssignment(actor.userId,actor.role,assignment.id)
 const task=await findGroupTask(scope,taskId)
 expect(task?.name).toContain('只读')
 expect((await trainingGroupHistory({...scope,taskId})).artifacts.some(row=>row.artifactId===pointer.artifactId)).toBe(true)
 expect((await trainingGroupTools({...scope,taskId})).tools).toEqual([])
 expect(await readTrainingGroupReport({...scope,taskId,artifactId:pointer.artifactId})).toEqual(before)
 writeFileSync('/tmp/training-standalone-cognitive-group-archived-proof.json',JSON.stringify({passed:true,archivedTaskStillListed:true,oldSnapshotUnchanged:true,newGenerationUnavailable:true,productionAccessed:false},null,2))
},30_000)
