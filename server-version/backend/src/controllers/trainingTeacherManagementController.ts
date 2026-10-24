import { Request, Response } from 'express'
import { z } from 'zod'
import { error, success } from '../utils/response'
import { generateTempPassword, hashPassword } from '../utils/password'
import { logger } from '../utils/logger'
import { AdminPermissionError } from '../modules/admin-permissions/service'
import { manageTrainingTeacher, trainingTeacherManagementPreflight, type TrainingTeacherCommand } from '../services/trainingTeacherManagement'
import { BoundedAdmissionGate, isBoundedAdmissionBusyError } from '../services/boundedAdmissionGate'

const common={expectedUpdatedAt:z.string().datetime()}
const commandSchema=z.discriminatedUnion('action',[
  z.object({...common,action:z.literal('EXTEND'),months:z.number().int().min(1).max(120).default(12)}).strict(),
  z.object({...common,action:z.literal('FREEZE')}).strict(),
  z.object({...common,action:z.literal('UNFREEZE')}).strict(),
  z.object({...common,action:z.literal('RESET_PASSWORD')}).strict(),
])
const gate=new BoundedAdmissionGate({name:'training_teacher_management',maxConcurrent:2,maxQueue:4,maxWaitMs:1000,retryAfterSeconds:2})
export async function trainingTeacherManagement(req:Request,res:Response) {
  res.setHeader('Cache-Control','private, no-store, max-age=0')
  res.setHeader('Pragma','no-cache')
  res.setHeader('Referrer-Policy','no-referrer')
  const parsed=commandSchema.safeParse(req.body)
  if(!parsed.success) return error(res,'管理参数无效，请刷新后重新选择操作',-1,400)
  if(!req.user) return error(res,'请先登录',-1,401)
  const input:TrainingTeacherCommand={...parsed.data,actorUserId:req.user.userId,targetUserId:req.params.id,actorSession:req.user}
  try {
    return await gate.run(async()=>{
      if(input.action!=='RESET_PASSWORD') return success(res,await manageTrainingTeacher(input),'培训师账号已更新')
      await trainingTeacherManagementPreflight(input)
      const temporaryPassword=generateTempPassword()
      const passwordHash=await hashPassword(temporaryPassword)
      const updated=await manageTrainingTeacher({...input,passwordHash})
      return success(res,{...updated,temporaryPassword},'密码已重置，首次登录须修改密码')
    })
  } catch(cause) {
    if(cause instanceof AdminPermissionError) return error(res,cause.message,-1,cause.statusCode)
    if(isBoundedAdmissionBusyError(cause)) {
      res.setHeader('Retry-After',String(cause.retryAfterSeconds));return error(res,'账号管理服务繁忙，请稍后重试',-1,503)
    }
    // Never include the request body, hash or generated credential in logs.
    logger.error('Training 培训师账号操作失败',{action:input.action,actorUserId:input.actorUserId,targetUserId:input.targetUserId})
    return error(res,'账号操作失败，请刷新列表确认状态后重试')
  }
}
