import {randomUUID} from 'node:crypto'
import {existsSync,readFileSync,writeFileSync} from 'node:fs'
import {afterAll,expect,it,vi} from 'vitest'
import {UserRole} from '@prisma/client'
import {prisma as db} from '../../config/database'
import {integrationDatabaseUrl,requireIsolatedReleaseDatabase} from './integration-env'
import {startStandaloneScaleAssessment} from '../../modules/scale/scale-start.controller'
import {submitScaleAssessmentFinal} from '../../modules/scale/scale-final-submit.service'
import {hashScaleDefinition} from '../../modules/scale/scale-definition'
import {MIXED_SCALE_DEFINITION} from '../questionnaire/product-fixtures'
import {trainingScaleGroupTaskKey} from '../../modules/training-analysis/group-source'
import {listTrainingGroupReports,trainingGroupTools,generateTrainingGroupReport,readTrainingGroupReport} from '../../modules/training-analysis/group-report.service'
import * as storage from '../../modules/assessment-runtime/compact-assessment-storage'
import * as runtime from '../../modules/assessment-runtime/runtime-snapshot'
const url=integrationDatabaseUrl('RELEASE_INTEGRATION_DATABASE_URL');if(!url)throw Error('isolated PostgreSQL required');requireIsolatedReleaseDatabase(url)
afterAll(async()=>{await (await import('../../config/queue')).closeQueues(true);await db.$disconnect()})

it('generates and reads a disclosed five-person standalone Scale report from frozen course Episodes without roster inference',async()=>{
 const old=JSON.parse(readFileSync('/tmp/training-scale-course-delivery-started.json','utf8'))
 const bootstrap=JSON.parse(readFileSync('/tmp/training-native-bundle-group-bootstrap.json','utf8'))
 const actor={userId:bootstrap.actor.userId,role:UserRole.TEACHER},scope={actor,courseId:old.courseA},taskId=trainingScaleGroupTaskKey(old.scaleId)
 const original=await db.assessment.findUniqueOrThrow({where:{id:old.restartedId}})
 expect(original).toMatchObject({status:'COMPLETED',episodeId:old.episodeId})
 const path='/tmp/training-standalone-scale-group-fixture.json'
 const people:Array<{userId:string;assessmentId:string|null;value:number;completed:boolean}>=existsSync(path)?JSON.parse(readFileSync(path,'utf8')):[{userId:old.userId,assessmentId:old.restartedId,value:0,completed:true}]
 for(let index=1;index<5;index++){
  let person=people[index]
  if(!person){
   const user=await db.user.create({data:{username:'scale-group-'+randomUUID(),passwordHash:'synthetic-only',role:'STUDENT',accountDomain:'TRAINING'}})
   await db.courseStudent.create({data:{courseId:old.courseA,studentId:user.id,status:'ACTIVE'}})
   person={userId:user.id,assessmentId:null,value:index%2,completed:false};people.push(person);writeFileSync(path,JSON.stringify(people))
  }
  if(!person.assessmentId){
   const response:any={body:null,statusCode:200,status(code:number){this.statusCode=code;return this},json(body:unknown){this.body=body;return this}}
   await startStandaloneScaleAssessment({user:{userId:person.userId,role:'STUDENT'},params:{scaleId:old.scaleId},body:{courseId:old.courseA}} as any,response)
   expect(response.body.code,response.body.message).toBe(0);person.assessmentId=response.body.data.assessment.id;writeFileSync(path,JSON.stringify(people))
  }
  if(person.completed)continue
  const row=await db.assessment.findUniqueOrThrow({where:{id:person.assessmentId!}})
  await submitScaleAssessmentFinal({assessmentId:row.id,userId:person.userId,submissionId:randomUUID(),attemptEpoch:row.attemptEpoch,definitionHash:hashScaleDefinition(MIXED_SCALE_DEFINITION),contextSnapshotHash:null,answers:[{itemCode:'mixed-scale-item-1',responseValue:person.value?'yes':'no'}]})
  person.completed=true;writeFileSync(path,JSON.stringify(people))
 }
 expect((await listTrainingGroupReports(scope)).tasks.some(row=>row.id===taskId)).toBe(true)
 const reader=vi.spyOn(storage,'createStoredScaleFactsReader'),catalog=await trainingGroupTools({...scope,taskId})
 expect(reader).not.toHaveBeenCalled();reader.mockRestore()
 expect(catalog.tools).toHaveLength(1)
 const tool=catalog.tools[0],{publication,configDigest,variantKey}=tool.source
 const generated=await generateTrainingGroupReport({...scope,selection:{taskId,toolKey:tool.key,publication,configDigest,variantKey}})
 expect(generated.projection).toMatchObject({tool:{kind:'SCALE'},completedN:5,countUnit:'PERSON',assignedN:null})
 expect(generated.projection.metrics[0]).toMatchObject({key:'total',state:'present',validN:5,missingN:0,mean:.4,range:{min:0,max:1},unit:'score'})
 expect(generated.projection.metrics[0].sdSample).toBeCloseTo(Math.sqrt(.3),12)
 // The synthetic unscoped attempt retained by #423 is not swept into this course.
 expect((await db.assessment.findUniqueOrThrow({where:{id:old.legacyId}})).episodeId).toBeNull()
 await db.courseStudent.delete({where:{courseId_studentId:{courseId:old.courseA,studentId:people[4].userId}}})
 const facts=vi.spyOn(storage,'createStoredScaleFactsReader'),frozen=vi.spyOn(runtime,'loadFrozenScaleRuntimeSnapshot')
 expect(await readTrainingGroupReport({...scope,taskId,artifactId:generated.artifactId})).toEqual(generated)
 expect(facts).not.toHaveBeenCalled();expect(frozen).not.toHaveBeenCalled();facts.mockRestore();frozen.mockRestore()
 await expect(readTrainingGroupReport({actor,courseId:old.courseB,taskId,artifactId:generated.artifactId})).rejects.toMatchObject({statusCode:404})
 const text=JSON.stringify(generated)
 for(const person of people)expect(text).not.toContain(person.userId)
 writeFileSync('/tmp/training-standalone-scale-group-proof.json',JSON.stringify({passed:true,participantN:5,reusedOriginalCompletion:true,newCompletions:4,values:[0,1,0,1,0],mean:.4,sdSample:generated.projection.metrics[0].sdSample,sourcePickerDoesNotReadResults:true,oldSnapshotEqual:true,readResultReaders:0,readFrozenRuntimeReaders:0,currentRosterRemovalDoesNotChangeSnapshot:true,unscopedAttemptNotRelabelled:true,otherCourseReadDenied:true,publicIdentityAbsent:true,rescoredByReport:false,productionAccessed:false},null,2))
},90_000)
