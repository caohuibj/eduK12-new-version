import { Router,type Request,type Response,type NextFunction } from 'express'
import { z } from 'zod'
import { prisma } from '../../config/database'
import { createRedisRateLimiter } from '../../middleware/redisRateLimit'
import { surveyPublicRateLimits } from './public-rate.config'
import { success,error } from '../../utils/response'
import { SurveyWaveError } from './waves.service'
import { SurveyFinalError,submitResearchFinal,readGeneralForOwnAttempt } from './final.service'
import { ResearchIdentityError,revokeLinkedResearchAccess,withdrawLinkedResearchData,withdrawSingleResearchAttempt } from './identity.service'
import { SurveyFinalValidationError } from './final.compute'
import { getOwnResearchTask } from './task.public'
import { resolveSurveyPublicId } from './public-project'
import * as admission from './admission.service'
import { surveyImageRefs } from './media.references'
import { serveAssessmentImageContent,AssessmentImageDeliveryError } from '../assessment-media/assessment-image-delivery'
import type { AssessmentStaticImageAssetIdentityV1 } from '../assessment-media/assessment-image'

export const publicSurveyRouter=Router()
publicSurveyRouter.use((_req,res,next)=>{
  res.setHeader('Cache-Control','no-store')
  res.setHeader('Referrer-Policy','no-referrer')
  next()
})
// A deliberately simple NAT-friendly ceiling, rather than separate quotas for
// every public action. Redis fail-closed and per-attempt FINAL authority remain.
publicSurveyRouter.use(createRedisRateLimiter({
  name:'survey-public-entry',
  ...surveyPublicRateLimits(),
}))
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

publicSurveyRouter.post('/r/:publicId/withdraw-linked',handle(async req=>{
  const params=identity.parse(req.body)
  const projectId=await resolveSurveyPublicId(id.parse(req.params.publicId))
  return withdrawLinkedResearchData({projectId,...params})
}))
publicSurveyRouter.post('/r/:publicId/attempts/:attemptId/withdraw-data',handle(req=>{
  const params=z.object({accessCredential:secret}).strict().parse(req.body)
  return withdrawSingleResearchAttempt({
    publicId:id.parse(req.params.publicId),
    attemptId:id.parse(req.params.attemptId),accessCredential:params.accessCredential,
  })
}))

/** POST because participant recovery credentials must never appear in URL,
 * query parameters or referer; response bytes are never publicly cacheable.
 */
publicSurveyRouter.post('/r/:publicId/attempts/:attemptId/images/:assetId',
  async(req,res,next)=>{
    try{
      const params=proof.parse(req.body)
      const own=await admission.verifiedSurveyAttempt({
        publicId:id.parse(req.params.publicId),
        attemptId:id.parse(req.params.attemptId),
        ...params,
      })
      if(!['STARTED','COMPLETED'].includes(own.status))return res.status(404).end()
      const assetId=id.parse(req.params.assetId)
      const refs=surveyImageRefs(own.compiledSnapshot.units.map(u=>({
        kind:u.kind,definition:u.displayDefinition,
      })))
      const frozen=refs.find(x=>x.asset.assetId===assetId)
      if(!frozen)return res.status(404).end()
      res.setHeader('Cache-Control','private, no-store, max-age=0')
      res.setHeader('X-Content-Type-Options','nosniff')
      return await serveAssessmentImageContent({
        reference:frozen.asset as AssessmentStaticImageAssetIdentityV1,res,
      })
    }catch(e){
      if(e instanceof z.ZodError||e instanceof SurveyWaveError
        ||e instanceof ResearchIdentityError||e instanceof AssessmentImageDeliveryError)
        return res.status(404).end()
      next(e)
    }
  })
