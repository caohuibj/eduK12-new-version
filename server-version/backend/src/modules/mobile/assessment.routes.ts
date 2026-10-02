import { Router } from 'express'
import { z } from 'zod'
import { config } from '../../config'
import { prisma } from '../../config/database'
import { authenticate } from '../../middleware/auth'
import { asyncHandler } from '../../middleware/asyncHandler'
import { success,notFound,error } from '../../utils/response'
import { scaleRunnerResponse } from '../scale/scale-start.controller'
export const assessmentRuntimeRouter=Router()
assessmentRuntimeRouter.use((_req,res,next)=>{res.set('Cache-Control','no-store');if(!config.miniAssessmentEnabled)return notFound(res);next()},authenticate)
// Read only, standalone frozen attempt. Uses the same runner response as the
// canonical start/resume controller; no admission, score or progress writer.
assessmentRuntimeRouter.get('/scales/:id',asyncHandler(async(req,res)=>{
 const id=z.string().regex(/^[A-Za-z0-9_-]{1,128}$/).parse(req.params.id)
 const attempt=await prisma.assessment.findUnique({where:{id},include:{scale:true}})
 if(!attempt||attempt.userId!==req.user!.userId||attempt.questionnaireAssessmentId||attempt.compositeAttemptId)return notFound(res)
 if(attempt.deliveryMode!=='FINAL_ONLY'||!attempt.runtimeSnapshotEncrypted)return error(res,'当前记录没有可验证的冻结 Runtime',-1,409)
 return success(res,scaleRunnerResponse(attempt,attempt.scale))
}))
assessmentRuntimeRouter.use((err:unknown,_q:any,res:any,next:any)=>{if(err instanceof z.ZodError)return error(res,'请求参数无效',-1,400);next(err)})
