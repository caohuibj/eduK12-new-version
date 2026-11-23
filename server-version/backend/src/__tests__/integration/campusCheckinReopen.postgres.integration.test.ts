import express from 'express'
import type {Server} from 'node:http'
import {randomUUID} from 'node:crypto'
import {PrismaClient} from '@prisma/client'
import {afterAll,beforeAll,describe,expect,it} from 'vitest'
import {integrationDatabaseUrl,requireIsolatedReleaseDatabase} from './integration-env'
import {setupEducationRuntimeActors} from './educationLibraryRuntimeFixture'
import {createCampusActivity,changeCampusActivityStatus} from '../../modules/campus/activity.service'
import {allocateCampusActivityParticipants,revokeCampusActivityParticipant} from '../../modules/campus/activity.allocation'
import {addCampusActivityTask} from '../../modules/campus/activity.tasks'
import activityRouter from '../../modules/campus/activity.routes'
import {csrfProtection} from '../../middleware/csrf'
import {generateToken} from '../../utils/jwt'
import {SCHOOL_AUTH_COOKIE_NAME,SCHOOL_CSRF_COOKIE_NAME,CSRF_HEADER_NAME} from '../../utils/authCookies'

const url=integrationDatabaseUrl('RELEASE_INTEGRATION_DATABASE_URL'),suite=url?describe:describe.skip
let db:PrismaClient,server:Server,base:string
suite('School completed check-in reopening retains only the current learner text',()=>{
 beforeAll(async()=>{
  requireIsolatedReleaseDatabase(url!)
  db=new PrismaClient({datasources:{db:{url:url!}}});await db.$connect()
  const app=express();app.use(express.json());app.use('/api',csrfProtection);app.use('/api/campus',activityRouter)
  app.use((error:any,_req:any,res:any,_next:any)=>res.status(error.statusCode??500).json({code:error.code??'ERROR',message:error.message}))
  server=app.listen(0,'127.0.0.1');await new Promise<void>(done=>server.once('listening',done));base='http://127.0.0.1:'+(server.address() as {port:number}).port
 })
 afterAll(async()=>{if(server)await new Promise<void>(done=>server.close(()=>done()));await db?.$disconnect()})
 it('reopens an actual submitted answer unchanged, returns null before submission, and rechecks exact course and current participant access',async()=>{
  const f=await setupEducationRuntimeActors(db,'SCHOOL'),other=await setupEducationRuntimeActors(db,'SCHOOL')
  const activity=await createCampusActivity({actor:f.schoolAdmin!,organizationId:f.organizationId,title:'只读本人活动记录',purpose:'STUDENT_WELLBEING'})
  const scope={actor:f.schoolAdmin!,organizationId:f.organizationId,courseId:activity.id}
  const task=await addCampusActivityTask({...scope,kind:'CHECKIN',title:'原记录',content:'活动说明'})
  await allocateCampusActivityParticipants({...scope,classUnitIds:[f.classUnitId!],requestKey:randomUUID(),expectedVersion:1})
  await changeCampusActivityStatus({...scope,action:'SUBMIT',expectedVersion:1})
  await changeCampusActivityStatus({...scope,action:'OPEN',expectedVersion:2})
  const headers=async(userId:string)=>{
   const user=await db.user.findUniqueOrThrow({where:{id:userId}}),csrf='school-checkin-reopen'
   const token=generateToken({userId,username:user.username,role:user.role,accountDomain:'SCHOOL',sessionProduct:'HUISCHOOL',tokenVersion:user.tokenVersion,mfaVerifiedAt:Math.floor(Date.now()/1000)})
   return {cookie:`${SCHOOL_AUTH_COOKIE_NAME}=${token}; ${SCHOOL_CSRF_COOKIE_NAME}=${csrf}`,[CSRF_HEADER_NAME]:csrf,'content-type':'application/json'}
  }
  const studentHeaders=await headers(f.participantUserId),endpoint=base+`/api/campus/activities/${activity.id}/checkins/${task.id}`
  const initial=await fetch(endpoint,{headers:studentHeaders});expect(initial.status).toBe(200)
  expect((await initial.json()).data).toMatchObject({id:task.id,title:'原记录',content:'活动说明',mySubmission:null})
  const content='这是已经提交并须原样保留的本人活动记录。'
  const submit=await fetch(endpoint+'/submit',{method:'POST',headers:{...studentHeaders,'Idempotency-Key':randomUUID()},body:JSON.stringify({content,expectedRevision:0})})
  expect(submit.status).toBe(200)
  const original=await db.checkinSubmission.findUniqueOrThrow({where:{checkinId_studentId:{checkinId:task.id,studentId:f.participantUserId}}})
  const reopened=await fetch(endpoint+'?studentId='+other.participantUserId,{headers:studentHeaders});expect(reopened.status).toBe(200)
  const body=await reopened.json();expect(body.data.mySubmission).toEqual({content,status:'SUBMITTED'})
  expect(body.data).not.toHaveProperty('submissions');expect(JSON.stringify(body.data)).not.toContain('idempotency')
  expect(await db.checkinSubmission.findUniqueOrThrow({where:{id:original.id}})).toEqual(original)
  expect((await fetch(endpoint,{headers:await headers(other.participantUserId)})).status).toBe(404)
  expect((await fetch(endpoint,{headers:await headers(f.manager.userId)})).status).toBe(403)
  expect((await fetch(endpoint.replace(activity.id,randomUUID()),{headers:studentHeaders})).status).toBe(404)
  await revokeCampusActivityParticipant({...scope,membershipId:f.participantMembershipId})
  expect((await fetch(endpoint,{headers:studentHeaders})).status).toBe(404)
  expect(await db.checkinSubmission.findUniqueOrThrow({where:{id:original.id}})).toEqual(original)
 },60000)
})
