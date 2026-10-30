import {randomUUID} from 'node:crypto'
import {existsSync,readFileSync,writeFileSync} from 'node:fs'
import {afterAll,expect,it} from 'vitest'
import {prisma as db} from '../../config/database'
import {integrationDatabaseUrl,requireIsolatedReleaseDatabase} from './integration-env'
import {MIXED_SCALE_DEFINITION} from '../questionnaire/product-fixtures'
import {publishRegisteredScaleFixture} from './registered-resource-fixture'
import {hashScaleDefinition} from '../../modules/scale/scale-definition'
import {startStandaloneScaleAssessment} from '../../modules/scale/scale-start.controller'
import {restartStandaloneScaleAssessmentWithPolicy} from '../../modules/scale/scale-restart.service'
import {submitScaleAssessmentFinal} from '../../modules/scale/scale-final-submit.service'

const url=integrationDatabaseUrl('RELEASE_INTEGRATION_DATABASE_URL');if(!url)throw Error('isolated PostgreSQL required');requireIsolatedReleaseDatabase(url)
afterAll(async()=>{await (await import('../../config/queue')).closeQueues(true);await db.$disconnect()})

it('freezes trusted new Scale course delivery, preserves it through restart and FINAL, and never relabels another source',async()=>{
 const bootstrap=JSON.parse(readFileSync('/tmp/training-native-bundle-group-bootstrap.json','utf8'))
 const people=JSON.parse(readFileSync('/tmp/training-native-bundle-group-disclosed-fixture.json','utf8')) as Array<{student:string}>
 const userId=people[0].student,legacyUserId=people[1].student,path='/tmp/training-scale-course-delivery-fixture.json'
 let fixture:{scaleId:string;courseA:string;courseB:string}
 if(existsSync(path))fixture=JSON.parse(readFileSync(path,'utf8'))
 else{
  const scale=await db.scale.create({data:{code:'scale-course-'+randomUUID(),name:'Course origin fixture',creatorId:bootstrap.actor.userId,status:'PUBLISHED',visibility:'COURSE',instrumentClass:'CUSTOM_DESCRIPTIVE',instrumentVersion:'2.0.0',definition:MIXED_SCALE_DEFINITION as any,definitionHash:hashScaleDefinition(MIXED_SCALE_DEFINITION),itemCount:1,dimensionCount:1}})
  await publishRegisteredScaleFixture(db,scale.id)
  const courses=[]
  for(const title of ['A','B']){
   const course=await db.course.create({data:{creatorId:bootstrap.actor.userId,title:'Scale course '+title,courseType:'TRAINING_COURSE',courseCode:'scale-course-'+randomUUID(),status:'PUBLISHED'}})
   await db.courseScale.create({data:{courseId:course.id,scaleId:scale.id}})
   await db.courseStudent.create({data:{courseId:course.id,studentId:userId,status:'ACTIVE'}});courses.push(course.id)
  }
  await db.courseStudent.create({data:{courseId:courses[0],studentId:legacyUserId,status:'ACTIVE'}})
  fixture={scaleId:scale.id,courseA:courses[0],courseB:courses[1]};writeFileSync(path,JSON.stringify(fixture))
 }
 const start=async(student:string,courseId?:string)=>{
  const response:any={statusCode:200,body:null,status(code:number){this.statusCode=code;return this},json(body:unknown){this.body=body;return this}}
  await startStandaloneScaleAssessment({user:{userId:student,role:'STUDENT'},params:{scaleId:fixture.scaleId},body:courseId?{courseId}:{}} as any,response)
  return response
 }
 const forged=await start(userId,randomUUID());expect(forged.statusCode,forged.body.message).toBe(403)
 expect(await db.assessment.count({where:{scaleId:fixture.scaleId,userId}})).toBe(0)
 const started=await start(userId,fixture.courseA);expect(started.body.code,started.body.message).toBe(0)
 const originalId=started.body.data.assessment.id
 const original=await db.assessment.findUniqueOrThrow({where:{id:originalId},include:{episode:true}})
 expect(original.episode).toMatchObject({courseId:fixture.courseA,subjectUserId:userId,initiatedByUserId:userId,initiationMode:'STUDENT_SELF',campaignKey:'training-standalone-scale-v1:'+fixture.scaleId})
 expect((await start(userId,fixture.courseA)).body.data.assessment.id).toBe(originalId)
 const wrong=await start(userId,fixture.courseB);expect(wrong.statusCode,wrong.body.message).toBe(409)
 expect((await db.assessment.findUniqueOrThrow({where:{id:originalId}})).episodeId).toBe(original.episodeId)
 const legacy=await start(legacyUserId);expect(legacy.body.code,legacy.body.message).toBe(0)
 const legacyId=legacy.body.data.assessment.id
 expect((await db.assessment.findUniqueOrThrow({where:{id:legacyId}})).episodeId).toBeNull()
 expect((await start(legacyUserId,fixture.courseA)).statusCode).toBe(409)
 expect((await db.assessment.findUniqueOrThrow({where:{id:legacyId}})).episodeId).toBeNull()
 const restarted=await restartStandaloneScaleAssessmentWithPolicy(originalId,userId)
 expect(restarted.episodeId).toBe(original.episodeId)
 expect((await db.assessment.findUniqueOrThrow({where:{id:originalId}})).status).toBe('ABANDONED')
 writeFileSync('/tmp/training-scale-course-delivery-started.json',JSON.stringify({...fixture,userId,originalId,restartedId:restarted.id,episodeId:original.episodeId,legacyId}))
 await submitScaleAssessmentFinal({assessmentId:restarted.id,userId,submissionId:randomUUID(),attemptEpoch:restarted.attemptEpoch,definitionHash:hashScaleDefinition(MIXED_SCALE_DEFINITION),contextSnapshotHash:null,answers:[{itemCode:'mixed-scale-item-1',responseValue:'no'}]})
 expect(await db.assessment.findUniqueOrThrow({where:{id:restarted.id}})).toMatchObject({status:'COMPLETED',episodeId:original.episodeId})
 writeFileSync('/tmp/training-scale-course-delivery-proof.json',JSON.stringify({passed:true,trustedCourseAllocationAndMembership:true,newEpisodeUsesExistingField:true,sameCourseResumesOriginal:true,crossCourseInProgressRejected:true,legacyUnscopedAttemptNotBackfilled:true,restartKeepsEpisode:true,finalKeepsEpisode:true,newSchema:false,historyRewritten:false,productionAccessed:false},null,2))
},90_000)
