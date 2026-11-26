import {afterAll,beforeAll,describe,expect,it,vi} from 'vitest'
import {setTimeout as wait} from 'node:timers/promises'
import {randomUUID} from 'node:crypto'
import type {PrismaClient} from '@prisma/client'
import {integrationDatabaseUrl} from '../integration/integration-env'

// Shares the existing PR26_INTEGRATION_DATABASE_URL opt-in; no developer/production fallback.
const databaseUrl=integrationDatabaseUrl('PR26_INTEGRATION_DATABASE_URL')
const suite=databaseUrl?describe:describe.skip
vi.mock('../../services/classroomDanmaku',()=>({classroomDanmaku:{close:vi.fn().mockResolvedValue({})}}))
let db:PrismaClient,observer:PrismaClient,api:typeof import('../../services/classroomLifecycleService')
let userId='',courseId=''
async function fixture(count=2,expired=false){
 const startedAt=new Date(Date.now()-(expired?10000:0))
 const classroom=await db.classroom.create({data:{name:'AUDIT1126 shared answer barrier',code:randomUUID(),courseId,creatorId:userId,status:'ACTIVE'}})
 const question=await db.classroomQuestion.create({data:{classroomId:classroom.id,questionIndex:0,questionContent:{type:'single_choice',question:'Synthetic shared answer?',options:['A','B']},timeLimit:expired?1:120,startedAt}})
 const sessions=await Promise.all(Array.from({length:count},()=>db.classroomSession.create({data:{classroomId:classroom.id,studentId:'temp_'+randomUUID(),isTemporary:true}})))
 return {classroom,question,sessions,input:(index:number,answer:unknown='A')=>({classroomId:classroom.id,questionId:question.id,sessionId:sessions[index].id,studentId:sessions[index].studentId,expectedStartedAt:startedAt,answer})}
}
async function waitForBlockedInsert(){
 const deadline=Date.now()+2500
 while(Date.now()<deadline){
  const result=await observer.$queryRaw<Array<{count:bigint}>>`SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid() AND wait_event_type='Lock' AND query LIKE 'INSERT INTO "public"."classroom_answers"%'`
  if(Number(result[0].count)>0)return
  await wait(10)
 }
 throw new Error('Synthetic answer did not reach the intentionally blocked FK insert')
}
async function holdSession(sessionId:string){
 let release!:()=>void,held!:()=>void
 const signal=new Promise<void>(resolve=>{held=resolve}),gate=new Promise<void>(resolve=>{release=resolve})
 const transaction=observer.$transaction(async tx=>{await tx.$executeRaw`SELECT id FROM classroom_sessions WHERE id=${sessionId} FOR UPDATE`;held();await gate},{timeout:15000})
 await signal
 return {release,transaction}
}
suite('classroom answer shared lifecycle barrier (real PostgreSQL)',()=>{
 beforeAll(async()=>{
  process.env.DATABASE_URL=databaseUrl!
  db=(await import('../../config/database')).prisma
  const {PrismaClient}=await import('@prisma/client');observer=new PrismaClient({datasources:{db:{url:databaseUrl!}}})
  api=await import('../../services/classroomLifecycleService')
  const user=await db.user.create({data:{username:'answer-race-'+randomUUID(),passwordHash:'synthetic-only',role:'TEACHER',accountDomain:'TRAINING'}});userId=user.id
  courseId=(await db.course.create({data:{title:'AUDIT1126 answer barrier fixtures',courseCode:randomUUID(),courseType:'TRAINING_COURSE',creatorId:userId,status:'PUBLISHED'}})).id
 },20000)
 afterAll(async()=>{
  if(db){if(courseId)await db.course.delete({where:{id:courseId}});if(userId)await db.user.delete({where:{id:userId}});await db.$disconnect()}
  if(observer)await observer.$disconnect()
 })
 it('lets another participant commit while one answer waits on its own session FK',async()=>{
  const f=await fixture(),lock=await holdSession(f.sessions[0].id)
  let first:ReturnType<typeof api.submitClassroomAnswer>|undefined,second:ReturnType<typeof api.submitClassroomAnswer>|undefined,parallel=false
  try{
   first=api.submitClassroomAnswer(f.input(0));await waitForBlockedInsert()
   second=api.submitClassroomAnswer(f.input(1,'B'))
   parallel=await Promise.race([second.then(()=>true),wait(600).then(()=>false)])
  }finally{lock.release();await lock.transaction;await first;await second}
  expect(parallel).toBe(true)
  expect(await db.classroomAnswer.count({where:{questionId:f.question.id}})).toBe(2)
 },10000)
 it('keeps concurrent equal canonical payloads idempotent without a unique-constraint transaction abort',async()=>{
  const f=await fixture(1)
  const answers=[{selected:['A'],meta:{a:1,b:2}},{meta:{b:2,a:1},selected:['A']}]
  const results=await Promise.all(Array.from({length:12},(_,index)=>api.submitClassroomAnswer(f.input(0,answers[index%2]))))
  expect(results.filter(result=>!result.alreadySubmitted)).toHaveLength(1)
  expect(await db.classroomAnswer.count({where:{questionId:f.question.id}})).toBe(1)
 })
 it('never overwrites the winning payload when duplicate requests disagree',async()=>{
  const f=await fixture(1)
  const results=await Promise.allSettled(['A','B'].map(answer=>api.submitClassroomAnswer(f.input(0,answer))))
  expect(results.filter(result=>result.status==='fulfilled')).toHaveLength(1)
  const failed=results.find(result=>result.status==='rejected') as PromiseRejectedResult
  expect(failed.reason).toBeInstanceOf(api.ClassroomLifecycleError);expect(failed.reason.message).toBe('您已提交过不同答案')
  expect(await db.classroomAnswer.count({where:{questionId:f.question.id}})).toBe(1)
 })
 it('holds the shared barrier until commit so close waits and later answers are rejected',async()=>{
  const f=await fixture(),lock=await holdSession(f.sessions[0].id)
  let answer:ReturnType<typeof api.submitClassroomAnswer>|undefined,closing:ReturnType<typeof api.closeClassroom>|undefined,closed=false
  try{
   answer=api.submitClassroomAnswer(f.input(0));await waitForBlockedInsert()
   closing=api.closeClassroom(f.classroom.id).then(result=>{closed=true;return result})
   await wait(100);expect(closed).toBe(false)
  }finally{lock.release();await lock.transaction;await answer;await closing}
  expect((await db.classroom.findUniqueOrThrow({where:{id:f.classroom.id}})).status).toBe('ENDED')
  await expect(api.submitClassroomAnswer(f.input(1))).rejects.toThrow('课堂当前不可提交答案')
  expect(await db.classroomAnswer.count({where:{questionId:f.question.id}})).toBe(1)
 },10000)
 it('keeps end/restart exclusive and rejects an answer carrying the old round timestamp',async()=>{
  const f=await fixture()
  await api.submitClassroomAnswer(f.input(0))
  await api.endClassroomQuestion(f.classroom.id,f.question.id,{expectedStartedAt:f.question.startedAt!})
  const restarted=await api.startClassroomQuestion({id:f.classroom.id,courseId,creatorId:userId,status:'ACTIVE',course:{creatorId:userId}},f.question.id,120)
  expect(restarted.kind).toBe('started')
  await expect(api.submitClassroomAnswer(f.input(1))).rejects.toThrow('题目已重新开始')
  const current=await db.classroomQuestion.findUniqueOrThrow({where:{id:f.question.id}})
  await expect(api.submitClassroomAnswer({...f.input(1),expectedStartedAt:current.startedAt!})).resolves.toMatchObject({expired:false,alreadySubmitted:false})
 })
 it('retires simultaneous expired answers outside their shared transactions without lock-upgrade deadlock',async()=>{
  const f=await fixture(8,true)
  const results=await Promise.allSettled(f.sessions.map((_,index)=>api.submitClassroomAnswer(f.input(index))))
  expect(results.some(result=>result.status==='fulfilled'&&result.value.expired)).toBe(true)
  for(const result of results)if(result.status==='rejected')expect(result.reason).toBeInstanceOf(api.ClassroomLifecycleError)
  expect((await db.classroomQuestion.findUniqueOrThrow({where:{id:f.question.id}})).endedAt).not.toBeNull()
  expect(await db.classroomAnswer.count({where:{questionId:f.question.id}})).toBe(0)
 },10000)
 it('retains exact classroom/session ownership checks on the shared submission path',async()=>{
  const a=await fixture(),b=await fixture()
  await expect(api.submitClassroomAnswer({...a.input(0),sessionId:b.sessions[0].id,studentId:b.sessions[0].studentId})).rejects.toThrow('课堂会话无效')
  await expect(api.submitClassroomAnswer({...a.input(0),questionId:b.question.id})).rejects.toThrow('题目不存在或不属于当前课堂')
  expect(await db.classroomAnswer.count({where:{questionId:a.question.id}})).toBe(0)
 })
})
