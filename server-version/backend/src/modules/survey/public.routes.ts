import { Router,type Request,type Response,type NextFunction } from 'express'
import { z } from 'zod'
import { prisma } from '../../config/database'
import { createRedisRateLimiter } from '../../middleware/redisRateLimit'
import { success,error } from '../../utils/response'
import { SurveyWaveError } from './waves.service'
import { SurveyFinalError,submitResearchFinal,readGeneralForOwnAttempt } from './final.service'
import { ResearchIdentityError,revokeLinkedResearchAccess } from './identity.service'
import { SurveyFinalValidationError } from './final.compute'
import { getOwnResearchTask } from './task.public'
import { resolveSurveyPublicId } from './public-project'
import * as admission from './admission.service'

export const publicSurveyRouter=Router()
publicSurveyRouter.use((_req,res,next)=>{
  res.setHeader('Cache-Control','no-store')
  res.setHeader('Referrer-Policy','no-referrer')
  next()
})
publicSurveyRouter.use(createRedisRateLimiter({name:'survey-public-entry',limit:300,windowSeconds:900}))
const id=z.string().uuid(), secret=z.string().regex(/^[A-Za-z0-9_-]{43}$/)
const code=z.string().regex(/^R-[A-Z0-9]{8,32}$/)
const consent=z.object({consent:z.literal(true),consentVersion:z.number().int().positive()})
const entry=consent.extend({entryToken:secret}).strict()
const linked=consent.extend({researchCode:code,accessCredential:secret}).strict()
const identity=z.object({researchCode:code,accessCredential:secret}).strict()
const proof=z.object({researchCode:code.optional(),accessCredential:secret}).strict()
const submission=proof.extend({submissionId:z.string().min(16).max(200),
  answers:z.record(z.record(z.unknown()))}).strict()
const handle=(action:(req:Request)=>Promise<unknown>)=>async(req:Request,res:Response,next:NextFunction)=>{
  try{return success(res,await action(req))}
  catch(e){
    if(e instanceof z.ZodError)return error(res,'输入不合法',-1,400)
    if(e instanceof SurveyWaveError||e instanceof SurveyFinalError||e instanceof ResearchIdentityError)
      return error(res,e.message,-1,e.statusCode)
    if(e instanceof SurveyFinalValidationError)return error(res,e.path+'：'+e.message,-1,400)
    next(e)
  }
}
publicSurveyRouter.get('/r/:publicId/info',handle(req=>
  admission.getPublicResearchInfo(id.parse(req.params.publicId))))
publicSurveyRouter.post('/r/:publicId/waves/:waveId/join',handle(req=>
  admission.joinLinkedStudy({publicId:id.parse(req.params.publicId),
    waveId:id.parse(req.params.waveId),...entry.parse(req.body)})))
publicSurveyRouter.post('/r/:publicId/enter',handle(req=>
  admission.listOwnLinkedWaves({publicId:id.parse(req.params.publicId),...identity.parse(req.body)})))
publicSurveyRouter.post('/r/:publicId/waves/:waveId/start',handle(req=>
  admission.startLinkedWave({publicId:id.parse(req.params.publicId),
    waveId:id.parse(req.params.waveId),...linked.parse(req.body)})))
publicSurveyRouter.post('/r/:publicId/waves/:waveId/start-unlinked',handle(req=>
  admission.startSingleUnlinkedWave({publicId:id.parse(req.params.publicId),
    waveId:id.parse(req.params.waveId),...entry.parse(req.body)})))
publicSurveyRouter.post('/r/:publicId/attempts/:attemptId/task',handle(req=>
  getOwnResearchTask({publicId:id.parse(req.params.publicId),
    attemptId:id.parse(req.params.attemptId),...proof.parse(req.body)})))
publicSurveyRouter.post('/r/:publicId/attempts/:attemptId/final',handle(req=>
  submitResearchFinal({publicId:id.parse(req.params.publicId),
    attemptId:id.parse(req.params.attemptId),...submission.parse(req.body)})))
publicSurveyRouter.post('/r/:publicId/attempts/:attemptId/general',handle(req=>
  readGeneralForOwnAttempt({publicId:id.parse(req.params.publicId),
    attemptId:id.parse(req.params.attemptId),...proof.parse(req.body)})))
publicSurveyRouter.post('/r/:publicId/revoke-access',handle(async req=>{
  const params=identity.parse(req.body)
  const projectId=await resolveSurveyPublicId(id.parse(req.params.publicId))
  return revokeLinkedResearchAccess({projectId,...params})
}))
