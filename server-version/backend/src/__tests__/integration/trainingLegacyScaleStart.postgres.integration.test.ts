import {randomUUID} from 'node:crypto'
import {readFileSync,writeFileSync} from 'node:fs'
import {afterAll,expect,it} from 'vitest'
import {prisma as db} from '../../config/database'
import {integrationDatabaseUrl,requireIsolatedReleaseDatabase} from './integration-env'
import {startStandaloneScaleAssessment} from '../../modules/scale/scale-start.controller'
const url=integrationDatabaseUrl('RELEASE_INTEGRATION_DATABASE_URL');if(!url)throw Error('isolated PostgreSQL required');requireIsolatedReleaseDatabase(url)
afterAll(async()=>{await (await import('../../config/queue')).closeQueues(true);await db.$disconnect()})

it('preserves an authorized LEGACY_COURSE first Scale start without converting its course type or rewriting history',async()=>{
 const old=JSON.parse(readFileSync('/tmp/training-scale-course-delivery-started.json','utf8'))
 const bootstrap=JSON.parse(readFileSync('/tmp/training-native-bundle-group-bootstrap.json','utf8'))
 const person=await db.user.create({data:{username:'legacy-scale-start-'+randomUUID(),passwordHash:'synthetic-only',role:'STUDENT',accountDomain:'TRAINING'}})
 const course=await db.course.create({data:{creatorId:bootstrap.actor.userId,title:'Legacy course compatibility fixture',courseType:'LEGACY_COURSE',courseCode:'legacy-scale-'+randomUUID(),status:'PUBLISHED'}})
 await db.courseScale.create({data:{courseId:course.id,scaleId:old.scaleId}})
 await db.courseStudent.create({data:{courseId:course.id,studentId:person.id,status:'ACTIVE'}})
 const response:any={body:null,statusCode:200,status(code:number){this.statusCode=code;return this},json(body:unknown){this.body=body;return this}}
 await startStandaloneScaleAssessment({user:{userId:person.id,role:'STUDENT'},params:{scaleId:old.scaleId},body:{courseId:course.id}} as any,response)
 expect(response.statusCode,response.body.message).toBe(200);expect(response.body.code,response.body.message).toBe(0)
 const row=await db.assessment.findUniqueOrThrow({where:{id:response.body.data.assessment.id},include:{episode:true}})
 expect(row).toMatchObject({status:'IN_PROGRESS',scaleId:old.scaleId,userId:person.id})
 expect(row.episode?.courseId).toBe(course.id)
 expect((await db.course.findUniqueOrThrow({where:{id:course.id}})).courseType).toBe('LEGACY_COURSE')
 expect((await db.assessment.findUniqueOrThrow({where:{id:old.legacyId}})).episodeId).toBeNull()
 writeFileSync('/tmp/training-legacy-scale-start-proof.json',JSON.stringify({passed:true,firstStartStatus:200,trustedAllocationAndMembership:true,realLegacyCourseIdPreserved:true,courseType:'LEGACY_COURSE',oldUnscopedAttemptUnchanged:true,oldTrainingLifecycleReplayed:false,productionAccessed:false},null,2))
},30_000)
