import { readFile,writeFile,mkdtemp,rm } from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import assetRoutes,{publicAssetRouter} from '../../routes/assets'
import {discardUnreferencedAsset} from '../../services/assetStorage'
import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import type { Server } from 'node:http'
import express from 'express'
import sharp from 'sharp'
import bcrypt from 'bcryptjs'
import { beforeAll, afterAll, describe, it, expect, vi } from 'vitest'
import { config } from '../../config'
import { prisma } from '../../config/database'
import { integrationDatabaseUrl } from './integration-env'
import authRoutes from '../../routes/auth'
import capabilitiesRoutes from '../../routes/capabilities'
import courseRoutes from '../../routes/courses'
import assignmentRoutes from '../../routes/assignments'
import userRoutes from '../../routes/users'
import teacherCodeRoutes from '../../routes/teacherCodes'
import {parentToolPolicyRouter} from '../../modules/parent-portal/tool-policy.routes'
import checkinRoutes from '../../routes/checkins'
import { mobileRouter } from '../../modules/mobile/routes'
import { classroomRuntimeRouter } from '../../modules/mobile/classroom.routes'
import { csrfProtection } from '../../middleware/csrf'
import { cacheService } from '../../services/cacheService'
import { ClassroomSocketHandler, classroomSocketHandler } from '../../services/classroomSocketHandler'
import { socketService } from '../../services/socketService'
import { endClassroomQuestion, joinClassroomStudent, startClassroomQuestion, submitClassroomAnswer } from '../../services/classroomLifecycleService'
const require=createRequire(import.meta.url)
const {createRuntime}=require('../../../../miniprogram-v2/app/bootstrap/index.js')
const {createOperations}=require('../../../../miniprogram-v2/domains/operations/service.js')
const {createPublicCheckinService}=require('../../../../miniprogram-v2/domains/public-checkin/service.js')
const {createToolPolicyService}=require('../../../../miniprogram-v2/domains/parents/tool-policy.js')
const {createClassroomService}=require('../../../../miniprogram-v2/domains/classrooms/service.js')
const DB=integrationDatabaseUrl('PARENT_PORTAL_TEST_DB_URL','PR26_INTEGRATION_DATABASE_URL')
const suite=DB?describe:describe.skip
let server:Server,base:string,hash:string,previousFlag:boolean,mediaDir:string
const mediaAssets:string[]=[]
let teacher:any,otherTeacher:any,student:any,stranger:any,course:any,assignment:any,checkin:any,classroom:any,question:any
const password='Synthetic-mini-operations-2026'
const userIds:string[]=[],retainedAuditActors=new Set<string>()
function client(){
 const stored=new Map(),calls:any[]=[]
 const runtime=createRuntime({canIUse:()=>true,uploadFile(o:any){calls.push(o);void (async()=>{const form=new FormData();for(const [key,value] of Object.entries(o.formData||{}))form.append(key,String(value));form.append(o.name,new Blob([await readFile(o.filePath)],{type:'image/png'}),'synthetic.png');const u=new URL(o.url),r=await fetch(base+u.pathname+u.search,{method:'POST',headers:o.header,body:form});o.success({statusCode:r.status,data:await r.text(),header:Object.fromEntries(r.headers)})})().catch(o.fail)},downloadFile(o:any){calls.push(o);void (async()=>{const u=new URL(o.url),r=await fetch(base+u.pathname+u.search,{headers:o.header}),tempFilePath=path.join(mediaDir,randomUUID()+'.png');await writeFile(tempFilePath,Buffer.from(await r.arrayBuffer()));o.success({statusCode:r.status,tempFilePath})})().catch(o.fail)},getFileSystemManager(){return {unlink(o:any){void rm(o.filePath,{force:true}).then(o.success).catch(o.fail)}}},request(o:any){calls.push(o);const u=new URL(o.url);void fetch(base+u.pathname+u.search,{method:o.method,headers:{...o.header,'Content-Type':'application/json'},body:o.method==='GET'?undefined:JSON.stringify(o.data)}).then(async r=>o.success({statusCode:r.status,header:Object.fromEntries(r.headers),cookies:r.headers.getSetCookie(),data:await r.json()})).catch(o.fail)},getNetworkType(o:any){o.success({networkType:'wifi'})},onNetworkStatusChange(){},setStorage(o:any){stored.set(o.key,o.data);o.success({})},getStorage(o:any){stored.has(o.key)?o.success({data:stored.get(o.key)}):o.fail({errMsg:'getStorage:fail data not found'})},removeStorage(o:any){stored.delete(o.key);o.success({})}},'https://mini-operations-fixture.example')
 runtime.publicCheckins=createPublicCheckinService(runtime.api);runtime.toolPolicies=createToolPolicyService(runtime.api,runtime.session);runtime.operations=createOperations(runtime.api,runtime.session);runtime.classrooms=createClassroomService(runtime.api,runtime.session)
 return {runtime,calls,stored}
}
async function logged(user:any){const c=client();await c.runtime.session.login({username:user.username,password});return c}
async function account(role:'TEACHER'|'STUDENT'|'ADMIN'|'PARENT'){const u=await prisma.user.create({data:{username:'mini-operations-'+randomUUID(),passwordHash:hash,role,teacherApproved:true}});userIds.push(u.id);return u}
// Actual HTTP + Cookie/CSRF + current DB authorization. Socket transport is
// represented by its real handler; only notification fan-out is stubbed.
suite('Mini role operations and shared classroom against actual HTTP/PostgreSQL/Redis',()=>{
 beforeAll(async()=>{
  const db=new URL(DB!),selected=new URL(process.env.DATABASE_URL||'')
  const local=['127.0.0.1','localhost'].includes(db.hostname)
  const hosted=process.env.CI==='true'&&local&&db.pathname==='/ptool'
  const release=process.env.RELEASE_VERIFY_LOCAL==='true'&&local&&db.pathname==='/eduk12_release'
  if(db.href!==selected.href||!local||(!/test|ci/i.test(db.pathname)&&!hosted&&!release))throw new Error('requires explicitly selected isolated test DB')
  const zone=await prisma.$queryRaw<Array<{zone:string}>>`SELECT current_setting('TimeZone') AS zone`;if(zone[0].zone!=='UTC')throw new Error('isolated fixture database must use UTC for Prisma timestamp contracts')
  if(process.env.MINI_OPERATIONS_TEST_REDIS_URL){const redis=new URL(process.env.MINI_OPERATIONS_TEST_REDIS_URL);if(!['127.0.0.1','localhost'].includes(redis.hostname))throw new Error('requires isolated loopback Redis');process.env.REDIS_URL=redis.href;await cacheService.initialize()}
  mediaDir=await mkdtemp(path.join(os.tmpdir(),'mini-operations-media-'));previousFlag=config.miniClassroomEnabled;config.miniClassroomEnabled=true
  hash=await bcrypt.hash(password,4);teacher=await account('TEACHER');otherTeacher=await account('TEACHER');student=await account('STUDENT');stranger=await account('STUDENT')
  course=await prisma.course.create({data:{title:'Mini operations fixture',courseCode:randomUUID().slice(0,12),creatorId:teacher.id,status:'PUBLISHED'}})
  await prisma.courseStudent.create({data:{courseId:course.id,studentId:student.id,status:'ACTIVE'}})
  assignment=await prisma.assignment.create({data:{title:'Assignment fixture',courseId:course.id,status:'PUBLISHED',questions:[]}})
  checkin=await prisma.checkin.create({data:{title:'Checkin fixture',courseId:course.id,creatorId:teacher.id}})
  classroom=await prisma.classroom.create({data:{name:'Classroom fixture',code:String(Math.floor(100000+Math.random()*900000)),courseId:course.id,creatorId:teacher.id,status:'PREPARING'}})
  question=await prisma.classroomQuestion.create({data:{classroomId:classroom.id,questionIndex:1,questionContent:{type:'single_choice',question:'Q',options:[{value:'A',label:'A'},{value:'B',label:'B'}],correctAnswer:'A'},timeLimit:60}})
  const app=express();app.use(express.json());app.use('/api',csrfProtection);app.use('/api/auth',authRoutes);app.use('/api/capabilities',capabilitiesRoutes);app.use('/api/mobile/classrooms',classroomRuntimeRouter);app.use('/api/mobile',mobileRouter);app.use('/api/courses',courseRoutes);app.use('/api/assignments',assignmentRoutes);app.use('/api/checkins',checkinRoutes);app.use('/api/assets',assetRoutes);app.use('/api/public/assets',publicAssetRouter);app.use('/api/users',userRoutes);app.use('/api/teacher-codes',teacherCodeRoutes);app.use('/api/parent-tool-policies',parentToolPolicyRouter);app.use((e:any,_q:any,r:any,_n:any)=>{console.error(e);r.status(500).json({code:-1,message:'fixture failure'})})
  server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));const address=server.address();if(!address||typeof address==='string')throw new Error('no listener');base='http://127.0.0.1:'+address.port
 })
 afterAll(async()=>{config.miniClassroomEnabled=previousFlag;(classroomSocketHandler as any).activeTimers.forEach((t:any)=>clearTimeout(t));(classroomSocketHandler as any).activeTimers.clear();if(server){server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()))}for(const id of mediaAssets){await prisma.assetReference.deleteMany({where:{assetId:id}});await discardUnreferencedAsset(await prisma.storedAsset.findUniqueOrThrow({where:{id}}))};if(mediaDir)await rm(mediaDir,{recursive:true,force:true});if(classroom)await prisma.classroom.delete({where:{id:classroom.id}});if(course)await prisma.course.delete({where:{id:course.id}});if(userIds.length)await prisma.user.deleteMany({where:{id:{in:userIds.filter(id=>!retainedAuditActors.has(id))}}});if(process.env.MINI_OPERATIONS_TEST_REDIS_URL)await cacheService.close();await prisma.$disconnect()})
 it('bounds lists and distinguishes current student membership, owner and unrelated teacher',async()=>{
  const s=await logged(student),t=await logged(teacher),o=await logged(otherTeacher),x=await logged(stranger)
  expect((await s.runtime.operations.list('assignments')).list.map((r:any)=>r.id)).toContain(assignment.id)
  expect((await s.runtime.operations.context('assignments',assignment.id)).allowedActions).toContain('submit')
  expect((await t.runtime.operations.context('assignments',assignment.id)).allowedActions).toContain('batchGrade')
  await expect(o.runtime.operations.context('assignments',assignment.id)).rejects.toMatchObject({kind:'forbidden'})
  await expect(x.runtime.operations.context('assignments',assignment.id)).rejects.toMatchObject({kind:'forbidden'})
  await expect(t.runtime.api.get('/mobile/lists/courses?pageSize=51')).rejects.toMatchObject({status:400})
 })
 it('native assignment retry retains command receipt and revision; stale update conflicts',async()=>{
  const s=await logged(student),form=await s.runtime.operations.prepare('assignments',assignment.id,'submit')
  expect(form.expectedRevision).toBe(0)
  await s.runtime.operations.execute('assignments',assignment.id,'submit',form,{content:'first'})
  await s.runtime.operations.execute('assignments',assignment.id,'submit',form,{content:'first'})
  expect(await prisma.submission.count({where:{assignmentId:assignment.id,studentId:student.id}})).toBe(1)
  const next=await s.runtime.operations.prepare('assignments',assignment.id,'submit');expect(next.expectedRevision).toBe(1)
  await s.runtime.operations.execute('assignments',assignment.id,'submit',next,{content:'second'})
  await expect(s.runtime.operations.execute('assignments',assignment.id,'submit',{...form,commandKey:randomUUID()},{content:'stale'})).rejects.toMatchObject({kind:'conflict'})
 })
 it('native checkin submission binds revision and cannot impersonate another student',async()=>{
  const s=await logged(student),form=await s.runtime.operations.prepare('checkins',checkin.id,'submit')
  await s.runtime.operations.execute('checkins',checkin.id,'submit',form,{content:'checkin'})
  await s.runtime.operations.execute('checkins',checkin.id,'submit',form,{content:'checkin'})
  expect(await prisma.checkinSubmission.count({where:{checkinId:checkin.id,studentId:student.id}})).toBe(1)
  const submitted=await s.runtime.api.post('/checkins/'+checkin.id+'/submit',{content:'forged',studentId:stranger.id,expectedRevision:1});expect(submitted.studentId).toBe(student.id);expect(await prisma.checkinSubmission.count({where:{checkinId:checkin.id,studentId:stranger.id}})).toBe(0)
 })
 it('teacher grading and course freeze use canonical controllers and refresh current membership',async()=>{
  const t=await logged(teacher),s=await logged(student),submission=await prisma.submission.findFirstOrThrow({where:{assignmentId:assignment.id}})
  await t.runtime.operations.grade(assignment.id,submission.id,'Good')
  expect((await prisma.submission.findUniqueOrThrow({where:{id:submission.id}})).comment).toBe('Good')
  await t.runtime.operations.roster(course.id,student.id,'freeze')
  await expect(s.runtime.api.get('/mobile/lists/assignments')).rejects.toMatchObject({kind:'unauthorized'})
  expect(s.runtime.session.get().user).toBe(null)
  await t.runtime.operations.roster(course.id,student.id,'unfreeze')
 })
 it('current legacy ADMIN manages invitations and creates parents without child authority; platform lifecycle needs SYSTEM_ADMIN',async()=>{
  const admin=await account('ADMIN'),a=await logged(admin)
  const form=await a.runtime.operations.prepare('users',undefined,'create'),parent=await a.runtime.operations.execute('users',undefined,'create',form,{username:'mini-parent-'+randomUUID(),password:'Synthetic-parent-2026',role:'PARENT',nickname:'Synthetic parent'});userIds.push(parent.id)
  expect(parent.role).toBe('PARENT');expect(await prisma.parentStudentRelationship.count({where:{parentUserId:parent.id}})).toBe(0)
  expect((await a.runtime.operations.context('users',parent.id)).allowedActions).not.toContain('deactivate')
  const codeForm=await a.runtime.operations.prepare('teacherCodes',undefined,'create'),code=await a.runtime.operations.execute('teacherCodes',undefined,'create',codeForm,{maxUses:'1'});expect(code.code).toBeTruthy()
  await a.runtime.operations.execute('teacherCodes',code.id,'delete',await a.runtime.operations.prepare('teacherCodes',code.id,'delete'),{})
  await expect(a.runtime.api.put('/users/'+parent.id,{isActive:false})).rejects.toMatchObject({kind:'forbidden'})
  await prisma.user.update({where:{id:admin.id},data:{platformRole:'SYSTEM_ADMIN'}});expect((await a.runtime.operations.context('users',parent.id)).allowedActions).toContain('deactivate')
  await a.runtime.operations.execute('users',parent.id,'deactivate',await a.runtime.operations.prepare('users',parent.id,'deactivate'),{});expect((await prisma.user.findUniqueOrThrow({where:{id:parent.id}})).isActive).toBe(false)
 })
 it('tool policy editor uses real Cookie/CSRF, current platform discovery, sealed command and optimistic version',async()=>{
  const root=await account('ADMIN');retainedAuditActors.add(root.id);await prisma.user.update({where:{id:root.id},data:{platformRole:'SYSTEM_ADMIN'}});const a=await logged(root),tool={family:'SCALE',key:'synthetic-'+randomUUID(),version:'1.0.0'},snapshot=await a.runtime.toolPolicies.read(tool)
  expect(snapshot.version).toBe(0);const policy={mode:'COMPLETION_ONLY',metricKeys:[],longitudinalMetricKeys:[]}
  await a.runtime.toolPolicies.save(tool,snapshot,policy);await a.runtime.toolPolicies.save(tool,snapshot,policy)
  const current=await a.runtime.toolPolicies.read(tool);expect(current.version).toBe(1)
  await expect(a.runtime.toolPolicies.save(tool,{...snapshot,commandKey:randomUUID()},policy)).rejects.toMatchObject({kind:'conflict'})
  await prisma.user.update({where:{id:root.id},data:{platformRole:'STANDARD'}});await expect(a.runtime.toolPolicies.save(tool,current,policy)).rejects.toMatchObject({kind:'forbidden'})
 })
 it('native owner/admin action discovery matches canonical sharing and token restrictions',async()=>{
  const admin=await account('ADMIN'),a=await logged(admin),t=await logged(teacher)
  expect((await t.runtime.operations.context('courses',course.id)).allowedActions).not.toContain('share')
  expect((await a.runtime.operations.context('courses',course.id)).allowedActions).toContain('share')
  await expect(t.runtime.api.get('/mobile/courses/'+course.id+'/share-options')).rejects.toMatchObject({kind:'forbidden'})
  expect((await a.runtime.operations.context('checkins',checkin.id)).allowedActions).not.toContain('tokens')
  expect((await t.runtime.operations.context('checkins',checkin.id)).allowedActions).not.toContain('createToken')
  const form=await a.runtime.operations.prepare('users',teacher.id,'extendAccount');await a.runtime.operations.execute('users',teacher.id,'extendAccount',form,{months:'1'});expect((await prisma.user.findUniqueOrThrow({where:{id:teacher.id}})).expiresAt).not.toBe(null)
 })
 it('actual native multipart private/public uploads bind assets, capabilities, revision and revoke',async()=>{
  const image=path.join(mediaDir,'input.png');await writeFile(image,await sharp({create:{width:2,height:2,channels:3,background:{r:255,g:255,b:255}}}).png().toBuffer())
  const s=await logged(student),t=await logged(teacher),asset=await s.runtime.operations.uploadImage('checkins',checkin.id,'submit',image);mediaAssets.push(asset.assetId)
  expect(asset.url).toMatch(/assets/);const local=await s.runtime.api.downloadAsset(asset.url);expect((await readFile(local)).length).toBeGreaterThan(0)
  const form=await s.runtime.operations.prepare('checkins',checkin.id,'submit');await s.runtime.operations.execute('checkins',checkin.id,'submit',form,{content:'with image'},{images:[asset]});expect((await prisma.checkinSubmission.findFirstOrThrow({where:{checkinId:checkin.id,studentId:student.id}})).images).toMatchObject([{assetId:asset.assetId}])
  await t.runtime.operations.execute('checkins',checkin.id,'anonymous',await t.runtime.operations.prepare('checkins',checkin.id,'anonymous'),{allowAnonymous:true})
  const token=await t.runtime.operations.execute('checkins',checkin.id,'createToken',await t.runtime.operations.prepare('checkins',checkin.id,'createToken'),{expiresAt:new Date(Date.now()+3600000).toISOString(),maxUses:'2'});expect(t.runtime.operations.publicLink(token.token)).toContain('/public/checkin/ck_')
  const context=await s.runtime.publicCheckins.open(token.token),publicAsset=await s.runtime.publicCheckins.upload(context,image);mediaAssets.push(publicAsset.assetId)
  const upload=s.calls.find(c=>c.url.includes('/public/'+token.token+'/upload'));expect(upload.header.Cookie).toBeUndefined();expect(upload.header['X-CSRF-Token']).toBeUndefined();expect(upload.header['X-Checkin-Session-Capability']).toBe(context.sessionCapability)
  const media=await s.runtime.publicCheckins.media(context,[publicAsset]);expect(media.length).toBe(1);const binary=s.calls.find(c=>c.url.includes('/public/assets/'));expect(binary.header.Cookie).toBeUndefined();expect(binary.header['X-Checkin-Session-Capability']).toBe(context.sessionCapability)
  await s.runtime.publicCheckins.submit(context,'anonymous',[publicAsset]);expect(await prisma.checkinSubmission.count({where:{checkinId:checkin.id,sessionId:context.sessionId}})).toBe(1)
  // Promotion removes public staging access; a shared token must not reveal
  // submitted participant media, even with the former upload capability.
  await expect(s.runtime.publicCheckins.media(context,[publicAsset])).rejects.toMatchObject({kind:'unavailable'})
  await t.runtime.operations.revokeToken(token.id);await expect(s.runtime.publicCheckins.open(token.token)).rejects.toBeTruthy()
 })
 it('default disabled runtime hides capability and rejects transport even for a valid account',async()=>{config.miniClassroomEnabled=false;try{const s=await logged(student);expect(s.runtime.session.get().capabilities.canJoinClassroom).toBe(false);await expect(s.runtime.api.get('/mobile/classrooms/'+classroom.id+'/state')).rejects.toMatchObject({kind:'notFound'})}finally{config.miniClassroomEnabled=true}})
 it('joins through actual Redis lookup, binds own session, and never discloses answer keys',async()=>{
  if(!process.env.MINI_OPERATIONS_TEST_REDIS_URL)throw new Error('this gate requires isolated Redis')
  const s=await logged(student);const joined=await s.runtime.classrooms.join(classroom.code);expect(joined.classroomId).toBe(classroom.id)
  const x=await logged(stranger);await expect(x.runtime.api.get('/mobile/classrooms/'+classroom.id+'/state')).rejects.toMatchObject({kind:'notFound'})
  const t=await logged(teacher),state=await t.runtime.classrooms.state(classroom.id);await t.runtime.classrooms.command(classroom.id,'START',{questionId:question.id},state)
  const own=await s.runtime.classrooms.state(classroom.id);expect(own.question.questionContent.correctAnswer).toBeUndefined();expect(own.questions).toBeUndefined();expect(own.availableActions).toContain('SUBMIT')
 })
 it('HTTP and Web handler race returns one winner, one persisted start and no timer reset',async()=>{
  await endClassroomQuestion(classroom.id,question.id)
  const t=await logged(teacher),state=await t.runtime.classrooms.state(classroom.id),handler=new ClassroomSocketHandler(),acks:any[]=[]
  const broadcast=vi.spyOn(socketService,'broadcastToRoom').mockImplementation(()=>{});try{
   await Promise.all([t.runtime.classrooms.command(classroom.id,'START',{questionId:question.id},state),...Array.from({length:8},async()=>{await (handler as any).handleTeacherStart({data:{authenticated:true,userId:teacher.id,userRole:'TEACHER',tokenVersion:0,classroomId:classroom.id},emit:vi.fn()},{questionId:question.id,timeLimit:60},(p:any)=>acks.push(p))})])
   const active=await prisma.classroomQuestion.findMany({where:{classroomId:classroom.id,startedAt:{not:null},endedAt:null}});expect(active).toHaveLength(1);expect(acks.every(a=>a.ok&&a.question.startedAt===active[0].startedAt!.toISOString())).toBe(true);expect(broadcast).toHaveBeenCalledTimes(1)
  }finally{broadcast.mockRestore();(handler as any).activeTimers.forEach((t:any)=>clearTimeout(t))}
 })
 it('repeat answer is idempotent; different answer, forged identity, and old round are rejected',async()=>{
  const s=await logged(student),state=await s.runtime.classrooms.state(classroom.id),body={questionId:question.id,startedAt:state.question.startedAt,answer:'B'}
  await s.runtime.classrooms.command(classroom.id,'SUBMIT',body,state);await s.runtime.classrooms.command(classroom.id,'SUBMIT',body,state)
  await expect(s.runtime.classrooms.command(classroom.id,'SUBMIT',{...body,answer:'A'},state)).rejects.toMatchObject({kind:'conflict'})
  await expect(s.runtime.api.post('/mobile/classrooms/'+classroom.id+'/submit',{...body,studentId:stranger.id})).rejects.toMatchObject({status:400})
  await endClassroomQuestion(classroom.id,question.id);await startClassroomQuestion({id:classroom.id,status:'ACTIVE',creatorId:teacher.id,courseId:course.id} as any,question.id,60)
  await expect(s.runtime.classrooms.command(classroom.id,'SUBMIT',body,state)).rejects.toMatchObject({kind:'conflict'})
  const fresh=await s.runtime.classrooms.state(classroom.id);expect(fresh.submitted).toBe(false)
  const expired=await endClassroomQuestion(classroom.id,question.id,{automatic:true,expectedStartedAt:new Date(body.startedAt)});expect(expired.changed).toBe(false)
 })
 it('late native and Web end commands cannot terminate a restarted round',async()=>{
  const t=await logged(teacher),old=await t.runtime.classrooms.state(classroom.id)
  await t.runtime.classrooms.command(classroom.id,'END',{questionId:question.id,startedAt:old.question.startedAt},old)
  await t.runtime.classrooms.command(classroom.id,'START',{questionId:question.id},await t.runtime.classrooms.state(classroom.id))
  const fresh=await t.runtime.classrooms.state(classroom.id)
  await expect(t.runtime.classrooms.command(classroom.id,'END',{questionId:question.id,startedAt:old.question.startedAt},old)).rejects.toMatchObject({kind:'conflict'})
  await expect(t.runtime.api.post('/mobile/classrooms/'+classroom.id+'/end',{questionId:question.id})).rejects.toMatchObject({status:400})
  const handler=new ClassroomSocketHandler(),socket={data:{authenticated:true,userId:teacher.id,userRole:'TEACHER',tokenVersion:0,classroomId:classroom.id},emit:vi.fn()}
  await (handler as any).handleTeacherEnd(socket,{questionId:question.id,startedAt:old.question.startedAt})
  expect(socket.emit).toHaveBeenCalledWith('error',expect.objectContaining({message:expect.stringContaining('重新开始')}))
  const persisted=await prisma.classroomQuestion.findUniqueOrThrow({where:{id:question.id}});expect(persisted.startedAt?.toISOString()).toBe(fresh.question.startedAt);expect(persisted.endedAt).toBe(null)
 })
 it('native explicit leave rejects old participant state until a new join',async()=>{
  const s=await logged(student),state=await s.runtime.classrooms.state(classroom.id);await s.runtime.classrooms.command(classroom.id,'LEAVE',{},state)
  await expect(s.runtime.classrooms.state(classroom.id)).rejects.toMatchObject({kind:'notFound'})
  await expect(s.runtime.api.post('/mobile/classrooms/'+classroom.id+'/submit',{questionId:question.id,startedAt:state.question.startedAt,answer:'A'})).rejects.toMatchObject({kind:'notFound'})
  await s.runtime.classrooms.join(classroom.code);expect((await s.runtime.classrooms.state(classroom.id)).classroom.id).toBe(classroom.id)
 })
 it('R2: authorized image URLs are available to the teacher and permitted classmates; refresh checks current list authority',async()=>{
  const t=await logged(teacher),s=await logged(student),x=await logged(stranger)
  const teacherList=await t.runtime.operations.list('checkins',{parent:checkin.id,view:'submissions'})
  const row=teacherList.list.find((r:any)=>r.value.studentId===student.id)
  expect(row.value.images).toHaveLength(1);expect(typeof row.value.images[0]).toBe('string')
  const image=await t.runtime.api.downloadAsset(row.value.images[0]);expect((await readFile(image)).length).toBeGreaterThan(0);t.runtime.api.discardFile(image)
  await expect(s.runtime.operations.list('checkins',{parent:checkin.id,view:'others'})).rejects.toMatchObject({kind:'forbidden'})
  await prisma.courseStudent.create({data:{courseId:course.id,studentId:stranger.id,status:'ACTIVE'}})
  await prisma.checkin.update({where:{id:checkin.id},data:{allowViewOthers:true}})
  const classmates=await x.runtime.operations.list('checkins',{parent:checkin.id,view:'others'}),peer=classmates.list.find((r:any)=>r.value.studentId===student.id)
  expect(peer.value.images).toHaveLength(1);const peerImage=await x.runtime.api.downloadAsset(peer.value.images[0]);expect((await readFile(peerImage)).length).toBeGreaterThan(0);x.runtime.api.discardFile(peerImage)
  const expired=new URL(peer.value.images[0],'https://mini-operations-fixture.example');expired.searchParams.set('expires','1')
  await expect(x.runtime.api.downloadAsset(expired.pathname+expired.search)).rejects.toMatchObject({kind:'unavailable'})
  const refreshed=await x.runtime.operations.list('checkins',{parent:checkin.id,view:'others'}),fresh=refreshed.list.find((r:any)=>r.value.studentId===student.id),freshImage=await x.runtime.api.downloadAsset(fresh.value.images[0]);x.runtime.api.discardFile(freshImage)
  await prisma.checkin.update({where:{id:checkin.id},data:{allowViewOthers:false}})
  await expect(x.runtime.operations.list('checkins',{parent:checkin.id,view:'others'})).rejects.toMatchObject({kind:'forbidden'})
  // Existing private signed URLs remain capabilities until their bounded expiry.
  // The record refresh must reauthorize via the list and clears the old local files.
  await prisma.courseStudent.delete({where:{courseId_studentId:{courseId:course.id,studentId:stranger.id}}})
 })
 it('R3: deadline clearing is rejected before HTTP, normal update persists, and checkin null clearing is supported',async()=>{
  const t=await logged(teacher),old='2030-01-01T00:00:00.000Z',next='2030-02-01T00:00:00.000Z'
  await prisma.assignment.update({where:{id:assignment.id},data:{deadline:new Date(old)}})
  let form=await t.runtime.operations.prepare('assignments',assignment.id,'edit');const before=t.calls.length
  await expect(t.runtime.operations.execute('assignments',assignment.id,'edit',form,{deadline:''})).rejects.toMatchObject({kind:'invalidRequest'})
  expect(t.calls.length).toBe(before);expect((await t.runtime.operations.detail('assignments',assignment.id)).entity.deadline).toBe(old)
  await t.runtime.operations.execute('assignments',assignment.id,'edit',form,{title:'Deadline unchanged'});expect((await t.runtime.operations.detail('assignments',assignment.id)).entity.deadline).toBe(old)
  form=await t.runtime.operations.prepare('assignments',assignment.id,'edit');await t.runtime.operations.execute('assignments',assignment.id,'edit',form,{deadline:next});expect((await t.runtime.operations.detail('assignments',assignment.id)).entity.deadline).toBe(next)
  // Editing text on an expired assignment must not resend its unchanged date
  // through the backend's 'new deadline must be in the future' validator.
  const past='2025-01-01T00:00:00.000Z';await prisma.assignment.update({where:{id:assignment.id},data:{deadline:new Date(past)}})
  form=await t.runtime.operations.prepare('assignments',assignment.id,'edit');await t.runtime.operations.execute('assignments',assignment.id,'edit',form,{title:'Expired task edited'});expect((await t.runtime.operations.detail('assignments',assignment.id)).entity.deadline).toBe(past);expect(t.calls.filter(c=>c.method==='PUT'&&c.url.includes('/assignments/')).at(-1).data).not.toHaveProperty('deadline')
  const created=await t.runtime.operations.execute('assignments',undefined,'create',await t.runtime.operations.prepare('assignments',undefined,'create'),{courseId:course.id,title:'Without deadline',deadline:''});expect((await t.runtime.operations.detail('assignments',created.id)).entity.deadline).toBeNull()
  await prisma.checkin.update({where:{id:checkin.id},data:{endTime:new Date(old)}})
  const checkinForm=await t.runtime.operations.prepare('checkins',checkin.id,'edit');await t.runtime.operations.execute('checkins',checkin.id,'edit',checkinForm,{endTime:''});expect((await t.runtime.operations.detail('checkins',checkin.id)).entity.endTime).toBeNull()
 })
 it('deadline commits termination and refuses answer; closed classroom cannot be rejoined',async()=>{
  await prisma.classroomQuestion.update({where:{id:question.id},data:{startedAt:new Date(Date.now()-120000),timeLimit:1}})
  const session=await prisma.classroomSession.findUniqueOrThrow({where:{classroomId_studentId:{classroomId:classroom.id,studentId:student.id}}})
  const result=await submitClassroomAnswer({classroomId:classroom.id,sessionId:session.id,studentId:student.id,questionId:question.id,answer:'A'});expect(result.expired).toBe(true);expect((await prisma.classroomQuestion.findUniqueOrThrow({where:{id:question.id}})).endedAt).not.toBe(null)
  expect(await prisma.classroomAnswer.count({where:{questionId:question.id}})).toBe(0)
  const t=await logged(teacher),state=await t.runtime.classrooms.state(classroom.id);await t.runtime.classrooms.command(classroom.id,'CLOSE',{},state)
  await expect(joinClassroomStudent({classroomId:classroom.id,studentId:student.id,isTemporary:false})).rejects.toMatchObject({statusCode:409})
 })

 it('prelaunch: course shortcuts preselect only current owners and reject unrelated teachers and students',async()=>{
  const t=await logged(teacher),o=await logged(otherTeacher),s=await logged(student)
  for(const domain of ['assignments','checkins','classrooms']) {
   const form=await t.runtime.operations.prepare(domain,undefined,'create',course.id)
   expect(form.fields.find((f:any)=>f.key==='courseId')).toMatchObject({value:course.id,selectionLabel:course.title})
   await expect(o.runtime.operations.prepare(domain,undefined,'create',course.id)).rejects.toMatchObject({kind:'forbidden'})
  }
  await expect(s.runtime.operations.prepare('assignments',undefined,'create',course.id)).rejects.toMatchObject({kind:'forbidden'})
 })
 it('prelaunch: teacher reads canonical choice labels and subjective answers through authorized HTTP only',async()=>{
  const t=await logged(teacher),s=await logged(student),o=await logged(otherTeacher)
  await prisma.assignment.update({where:{id:assignment.id},data:{deadline:null,questions:[
   {id:'mini-q1',type:'single_choice',question:'合成颜色',options:[{key:'C',text:'绿色系',points:0},{key:'D',text:'其他颜色',points:0}]},
   {id:'mini-q2',type:'text',question:'合成说明',options:[]},
  ]}})
  const form=await s.runtime.operations.prepare('assignments',assignment.id,'submit')
  await s.runtime.operations.execute('assignments',assignment.id,'submit',form,{'answer:mini-q1':'C','answer:mini-q2':'合成主观答案',content:'合成正文'})
  const submission=await prisma.submission.findUniqueOrThrow({where:{assignmentId_studentId:{assignmentId:assignment.id,studentId:student.id}}})
  const answers=await t.runtime.operations.assignmentAnswers(assignment.id,submission.answers)
  expect(answers[0]).toMatchObject({label:'题目 1（单选题）：合成颜色',value:'绿色系'})
  expect(answers[1]).toMatchObject({label:'题目 2（主观题）：合成说明',value:'合成主观答案'})
  await expect(o.runtime.operations.assignmentAnswers(assignment.id,submission.answers)).rejects.toMatchObject({kind:'forbidden'})
 })
})
