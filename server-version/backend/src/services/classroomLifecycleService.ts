import { prisma } from '../config/database'
import { canonicalHash } from '../modules/assessment-runtime/canonical'
import type { ClassroomAccessRecord } from '../middleware/classroomAccess'

export class ClassroomLifecycleError extends Error {
  constructor(message:string, readonly statusCode=409){super(message)}
}
export type StartOutcome = {kind:'started'|'already-active'|'conflict';question:any}|{kind:'question-not-found'}|{kind:'race-lost'}
// Both transports bind identity and resource authority before entering this
// domain service. A transaction locks the classroom for all lifecycle writes,
// so start, close and submit cannot observe mutually inconsistent states.
async function lockClassroom(tx:any,classroomId:string){
  await tx.$executeRaw`SELECT id FROM classrooms WHERE id=${classroomId} FOR UPDATE`
}
export async function startClassroomQuestion(classroom:ClassroomAccessRecord,questionId:string,requestedTimeLimit:number|null):Promise<StartOutcome>{
  return await prisma.$transaction(async (tx): Promise<StartOutcome> => {
          await lockClassroom(tx, classroom.id)
          const current = await tx.classroom.findUnique({ where: { id: classroom.id }, select: { status: true } })
          if (!current || !['PREPARING','ACTIVE'].includes(current.status)) throw new ClassroomLifecycleError('课堂当前不可开始答题',409)
          const active = await tx.classroomQuestion.findFirst({
            where: { classroomId: classroom.id, startedAt: { not: null }, endedAt: null },
            select: {
              id: true,
              questionContent: true,
              timeLimit: true,
              questionIndex: true,
              startedAt: true,
              endedAt: true,
            },
          })
          if (active && active.id !== questionId) return { kind: 'conflict', question: active }

          const candidate = await tx.classroomQuestion.findFirst({
            where: { id: questionId, classroomId: classroom.id },
            select: {
              id: true,
              classroomId: true,
              questionContent: true,
              timeLimit: true,
              questionIndex: true,
              startedAt: true,
              endedAt: true,
            },
          })
          if (!candidate) return { kind: 'question-not-found' }
          if (candidate.startedAt && !candidate.endedAt) return { kind: 'already-active', question: candidate }
          const timeLimit = Math.max(1, Math.min(3600, Math.floor(requestedTimeLimit ?? candidate.timeLimit ?? 60)))
          const startedAt = new Date()
          // Compare-and-set on both lifecycle timestamps. This makes two
          // same-question starts idempotent instead of resetting the winner's
          // start time or timer.
          const updated = await tx.classroomQuestion.updateMany({
            where: {
              id: candidate.id,
              classroomId: classroom.id,
              startedAt: candidate.startedAt,
              endedAt: candidate.endedAt,
            },
            data: { startedAt, endedAt: null, timeLimit },
          })
          if (updated.count !== 1) {
            const current = await tx.classroomQuestion.findUnique({
              where: { id: candidate.id },
              select: {
                id: true,
                questionContent: true,
                timeLimit: true,
                questionIndex: true,
                startedAt: true,
                endedAt: true,
              },
            })
            if (current?.startedAt && !current.endedAt) return { kind: 'already-active', question: current }
            const currentActive = await tx.classroomQuestion.findFirst({
              where: { classroomId: classroom.id, startedAt: { not: null }, endedAt: null },
              select: {
                id: true,
                questionContent: true,
                timeLimit: true,
                questionIndex: true,
                startedAt: true,
                endedAt: true,
              },
            })
            return currentActive
              ? { kind: 'conflict', question: currentActive }
              : { kind: 'race-lost' }
          }
          if (candidate.endedAt) {
            await tx.classroomAnswer.deleteMany({ where: { classroomId: classroom.id, questionId: candidate.id } })
          }
          await tx.classroom.update({ where: { id: classroom.id }, data: { status: 'ACTIVE', startedAt } })
          const persisted = await tx.classroomQuestion.findUnique({
            where: { id: candidate.id },
            select: {
              id: true,
              questionContent: true,
              timeLimit: true,
              questionIndex: true,
              startedAt: true,
              endedAt: true,
            },
          })
          return persisted ? { kind: 'started', question: persisted } : { kind: 'race-lost' }
        })
}
export async function joinClassroomStudent(input:{classroomId:string;studentId:string;isTemporary:boolean;resumeSessionId?:string}) {
  return prisma.$transaction(async tx=>{
    await lockClassroom(tx,input.classroomId)
    const classroom=await tx.classroom.findUnique({where:{id:input.classroomId},select:{status:true}})
    if(!classroom||!['PREPARING','ACTIVE'].includes(classroom.status))throw new ClassroomLifecycleError('课堂当前不可加入')
    let session
    if(input.resumeSessionId){
      session=await tx.classroomSession.findFirst({where:{id:input.resumeSessionId,classroomId:input.classroomId,isTemporary:true}})
      if(!session)throw new ClassroomLifecycleError('学生会话无效',404)
    }else{
      const key={classroomId:input.classroomId,studentId:input.studentId}
      session=await tx.classroomSession.upsert({where:{classroomId_studentId:key},create:{...key,isTemporary:input.isTemporary},update:{}})
    }
    if(session.leftAt)session=await tx.classroomSession.update({where:{id:session.id},data:{leftAt:null}})
    return session
  })
}
export async function endClassroomQuestion(classroomId:string,questionId:string,options:{automatic?:boolean;expectedStartedAt?:Date}={}){
 return prisma.$transaction(async tx=>{
  await lockClassroom(tx,classroomId)
  const classroom=await tx.classroom.findUnique({where:{id:classroomId},select:{status:true}})
  if(!classroom||classroom.status!=='ACTIVE'){if(options.automatic)return {changed:false,questionId};throw new ClassroomLifecycleError('课堂当前不可结束答题')}
  const question=await tx.classroomQuestion.findFirst({where:{id:questionId,classroomId},select:{id:true,startedAt:true,endedAt:true,timeLimit:true}})
  if(!question)throw new ClassroomLifecycleError('题目不存在或不属于当前课堂',404)
  if(!question.startedAt||question.endedAt)return {changed:false,questionId}
  if(options.expectedStartedAt&&question.startedAt.getTime()!==options.expectedStartedAt.getTime())return {changed:false,questionId,staleRound:true}
  if(options.automatic&&Date.now()<question.startedAt.getTime()+(question.timeLimit||60)*1000)return {changed:false,questionId}
  const result=await tx.classroomQuestion.updateMany({where:{id:questionId,classroomId,startedAt:question.startedAt,endedAt:null},data:{endedAt:new Date()}})
  return {changed:result.count>0,questionId}
 })
}
export async function closeClassroom(classroomId:string){
 return prisma.$transaction(async tx=>{await lockClassroom(tx,classroomId);const classroom=await tx.classroom.findUnique({where:{id:classroomId},select:{status:true}});if(!classroom)throw new ClassroomLifecycleError('课堂不存在',404);if(classroom.status==='ENDED')return {changed:false,classroomId};const endedAt=new Date();await tx.classroomQuestion.updateMany({where:{classroomId,startedAt:{not:null},endedAt:null},data:{endedAt}});await tx.classroom.update({where:{id:classroomId},data:{status:'ENDED',endedAt}});return {changed:true,classroomId}})
}
export async function submitClassroomAnswer(input:{classroomId:string;sessionId:string;studentId:string;questionId:string;answer:unknown;expectedStartedAt?:Date}){
 const serialized=JSON.stringify(input.answer)
 if(!serialized||serialized.length>10000)throw new ClassroomLifecycleError('答案内容过大',400)
 return prisma.$transaction(async tx=>{
  await lockClassroom(tx,input.classroomId)
  const classroom=await tx.classroom.findUnique({where:{id:input.classroomId},select:{status:true}})
  if(!classroom||classroom.status!=='ACTIVE')throw new ClassroomLifecycleError('课堂当前不可提交答案')
  const question=await tx.classroomQuestion.findFirst({where:{id:input.questionId,classroomId:input.classroomId},select:{id:true,startedAt:true,endedAt:true,timeLimit:true}})
  if(!question)throw new ClassroomLifecycleError('题目不存在或不属于当前课堂',404)
  if(input.expectedStartedAt&&question.startedAt?.getTime()!==input.expectedStartedAt.getTime())throw new ClassroomLifecycleError('题目已重新开始，请刷新后作答')
  const session=await tx.classroomSession.findFirst({where:{id:input.sessionId,classroomId:input.classroomId,studentId:input.studentId},select:{id:true}})
  if(!session)throw new ClassroomLifecycleError('课堂会话无效',403)
  const existing=await tx.classroomAnswer.findUnique({where:{questionId_sessionId:{questionId:question.id,sessionId:session.id}}})
  if(existing){if(canonicalHash(existing.answer)!==canonicalHash(input.answer))throw new ClassroomLifecycleError('您已提交过不同答案');return {questionId:question.id,alreadySubmitted:true,expired:false}}
  if(!question.startedAt||question.endedAt)throw new ClassroomLifecycleError('答题已结束，无法提交答案')
  if(question.timeLimit&&Date.now()>=question.startedAt.getTime()+question.timeLimit*1000){await tx.classroomQuestion.updateMany({where:{id:question.id,classroomId:input.classroomId,endedAt:null},data:{endedAt:new Date()}});return {questionId:question.id,alreadySubmitted:false,expired:true}}
  await tx.classroomAnswer.create({data:{classroomId:input.classroomId,questionId:question.id,sessionId:session.id,answer:input.answer as any}})
  return {questionId:question.id,alreadySubmitted:false,expired:false}
 })
}
export async function leaveClassroomStudent(input:{classroomId:string;sessionId:string;studentId:string}){
 return prisma.classroomSession.updateMany({where:{id:input.sessionId,classroomId:input.classroomId,studentId:input.studentId,leftAt:null},data:{leftAt:new Date()}})
}
