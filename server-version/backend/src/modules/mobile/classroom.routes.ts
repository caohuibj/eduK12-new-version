import { Router } from 'express'
import { z } from 'zod'
import { config } from '../../config'
import { prisma } from '../../config/database'
import { authenticate } from '../../middleware/auth'
import { findClassroomAccess, canManageClassroom } from '../../middleware/classroomAccess'
import { createRedisRateLimiter } from '../../middleware/redisRateLimit'
import { checkClassroomLookupRateLimit, checkFailedClassroomCodeRateLimit } from '../../utils/classroomRateLimiter'
import { success, error, forbidden, notFound } from '../../utils/response'
import { joinClassroomStudent, startClassroomQuestion, endClassroomQuestion, closeClassroom, submitClassroomAnswer, leaveClassroomStudent, ClassroomLifecycleError } from '../../services/classroomLifecycleService'
import { classroomSocketHandler } from '../../services/classroomSocketHandler'

export const classroomRuntimeRouter=Router()
classroomRuntimeRouter.use((_req,res,next)=>{res.set('Cache-Control','no-store');if(!config.miniClassroomEnabled)return notFound(res);next()},authenticate)
const id=z.string().regex(/^[A-Za-z0-9_-]{1,128}$/)
const mutationLimit=createRedisRateLimiter({name:'mini-classroom-command',limit:120,windowSeconds:60,key:req=>req.user!.userId})
classroomRuntimeRouter.use((req,res,next)=>req.method==='GET'?next():mutationLimit(req,res,next))
const handle=(fn:(req:any,res:any)=>Promise<any>)=>(req:any,res:any,next:any)=>Promise.resolve().then(()=>fn(req,res)).catch(e=>{if(e instanceof z.ZodError)return error(res,'请求参数无效',-1,400);if(e instanceof ClassroomLifecycleError)return error(res,e.message,-1,e.statusCode);next(e)})
async function manager(req:any){const classroom=await findClassroomAccess(id.parse(req.params.id));if(!classroom)throw new ClassroomLifecycleError('课堂不存在',404);if(!canManageClassroom(classroom,req.user.userId,req.user.role))throw new ClassroomLifecycleError('无权限访问此课堂',403);return classroom}
async function participant(req:any){if(req.user.role!=='STUDENT')throw new ClassroomLifecycleError('需要学生身份',403);const session=await prisma.classroomSession.findUnique({where:{classroomId_studentId:{classroomId:id.parse(req.params.id),studentId:req.user.userId}}});if(!session||session.isTemporary||session.leftAt)throw new ClassroomLifecycleError('请先加入课堂',404);return session}
classroomRuntimeRouter.post('/join',handle(async(req,res)=>{
 const body=z.object({code:z.string().regex(/^\d{6}$/)}).strict().parse(req.body)
 if(req.user.role!=='STUDENT')return forbidden(res)
 const limit=await checkClassroomLookupRateLimit(req.ip||'unknown')
 if(!limit.available)return error(res,'课堂入口暂不可用',-1,503)
 if(!limit.allowed){res.set('Retry-After',String(limit.retryAfterSeconds));return error(res,'请求过于频繁',-1,429)}
 const classroom=await prisma.classroom.findUnique({where:{code:body.code},select:{id:true,name:true,status:true}})
 if(!classroom||!['PREPARING','ACTIVE'].includes(classroom.status)){const failed=await checkFailedClassroomCodeRateLimit(req.ip||'unknown',body.code);if(!failed.available)return error(res,'课堂入口暂不可用',-1,503);if(!failed.allowed){res.set('Retry-After',String(failed.retryAfterSeconds));return error(res,'请求过于频繁',-1,429)}return notFound(res,'课堂不存在或当前不可加入')}
 const session=await joinClassroomStudent({classroomId:classroom.id,studentId:req.user.userId,isTemporary:false})
 return success(res,{classroomId:classroom.id,name:classroom.name,sessionId:session.id})
}))
classroomRuntimeRouter.get('/:id/state',handle(async(req,res)=>{
 const classroomId=id.parse(req.params.id),student=req.user.role==='STUDENT'
 const session=student?await participant(req):null
 if(!student)await manager(req)
 const classroom=await prisma.classroom.findUnique({where:{id:classroomId},select:{id:true,name:true,status:true,code:true}})
 if(!classroom)return notFound(res)
 let question=await prisma.classroomQuestion.findFirst({where:{classroomId,startedAt:{not:null},endedAt:null},select:{id:true,questionContent:true,questionIndex:true,timeLimit:true,startedAt:true,endedAt:true}})
 if(question?.startedAt&&Date.now()>=question.startedAt.getTime()+(question.timeLimit||60)*1000){const ended=await endClassroomQuestion(classroomId,question.id,{automatic:true,expectedStartedAt:question.startedAt});if(ended.changed)await classroomSocketHandler.notifyQuestionEnded(classroomId,question.id);question=null}
 const own=question&&session?await prisma.classroomAnswer.findUnique({where:{questionId_sessionId:{questionId:question.id,sessionId:session.id}},select:{answer:true}}):null
 const availableActions=student?(classroom.status==='ACTIVE'&&question&&!own?['SUBMIT','LEAVE']:['LEAVE']):classroom.status==='ENDED'?[]:['START','CLOSE',...(question?['END']:[])]
 const questions=student?undefined:await prisma.classroomQuestion.findMany({where:{classroomId},select:{id:true,questionContent:true,questionIndex:true,timeLimit:true,startedAt:true,endedAt:true},orderBy:{questionIndex:'asc'},take:200})
 if(student&&question){const content=question.questionContent as any;question={...question,questionContent:content&&typeof content==='object'?{type:content.type,question:content.question,options:Array.isArray(content.options)?content.options.map((o:any)=>({value:o.value,label:o.label})):undefined}:null} as any}
 return success(res,{classroom,question,availableActions,...(student?{ownAnswer:own?.answer??null,submitted:Boolean(own)}:{questions,stats:question?await classroomSocketHandler.readQuestionStats(classroomId,question.id):null}),serverNow:new Date().toISOString()})
}))
classroomRuntimeRouter.post('/:id/start',handle(async(req,res)=>{
 const body=z.object({questionId:id,timeLimit:z.number().int().min(1).max(3600).optional()}).strict().parse(req.body),classroom=await manager(req)
 const result=await startClassroomQuestion(classroom,body.questionId,body.timeLimit??null)
 if(result.kind==='question-not-found')return notFound(res)
 if(result.kind==='conflict'||result.kind==='race-lost')return error(res,'其他题目正在进行中，请刷新',-1,409)
 if(result.kind==='started')classroomSocketHandler.notifyQuestionStarted(classroom.id,result.question)
 return success(res,{question:result.question,started:result.kind==='started'})
}))
classroomRuntimeRouter.post('/:id/end',handle(async(req,res)=>{const body=z.object({questionId:id,startedAt:z.string().datetime()}).strict().parse(req.body),classroom=await manager(req);const result=await endClassroomQuestion(classroom.id,body.questionId,{expectedStartedAt:new Date(body.startedAt)});if(result.staleRound)return error(res,'题目已重新开始，请刷新后操作',-1,409);if(result.changed)await classroomSocketHandler.notifyQuestionEnded(classroom.id,body.questionId);return success(res,result)}))
classroomRuntimeRouter.post('/:id/close',handle(async(req,res)=>{z.object({}).strict().parse(req.body);const classroom=await manager(req),result=await closeClassroom(classroom.id);if(result.changed)classroomSocketHandler.notifyClassroomClosed(classroom.id);return success(res,result)}))
classroomRuntimeRouter.post('/:id/submit',handle(async(req,res)=>{const body=z.object({questionId:id,startedAt:z.string().datetime(),answer:z.unknown().refine(v=>v!==undefined)}).strict().parse(req.body),session=await participant(req);const result=await submitClassroomAnswer({classroomId:session.classroomId,studentId:req.user.userId,sessionId:session.id,questionId:body.questionId,answer:body.answer,expectedStartedAt:new Date(body.startedAt)});if(result.expired){await classroomSocketHandler.notifyQuestionEnded(session.classroomId,body.questionId);return error(res,'答题已结束',-1,409)}if(!result.alreadySubmitted)classroomSocketHandler.notifyAnswerSubmitted(session.classroomId,body.questionId);return success(res,{questionId:body.questionId,submitted:true})}))
classroomRuntimeRouter.post('/:id/leave',handle(async(req,res)=>{z.object({}).strict().parse(req.body);const session=await participant(req);await leaveClassroomStudent({classroomId:session.classroomId,studentId:req.user.userId,sessionId:session.id});return success(res,{left:true})}))
