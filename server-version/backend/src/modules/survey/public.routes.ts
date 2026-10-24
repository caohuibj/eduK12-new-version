import {joinMemorableStudy,recoverMemorableIdentity,completeMemorableReset,joinGeneratedCodeStudy} from './memorable-code.service'
import {memorableCodeRateLimit} from './memorable-code.rate'
import {BoundedAdmissionBusyError} from '../../services/boundedAdmissionGate'
import {authorizeSurveyMaterial} from './material.authorization'
import {serveSurveyMaterial} from './material.delivery'
import {SurveyMediaError} from './media.references'
import {authorizeOwnSurveyImage,issueOwnSurveyScaleVideo} from './public-scale-media'
import {AssessmentMediaCapabilityError} from '../assessment-media/assessment-media-capability'
import {AssessmentAssetValidationError} from '../assessment-media/assessment-asset'
import { ScaleLibraryError } from '../scale-library-governance/contracts'
import { Router,type Request,type Response,type NextFunction } from 'express'
import { z } from 'zod'
import { prisma } from '../../config/database'
import { createSurveyPublicRateLimiter } from './public-rate.middleware'
import { success,error } from '../../utils/response'
import { SurveyWaveError } from './waves.service'
import { SurveyFinalError,submitResearchFinal,readGeneralForOwnAttempt } from './final.service'
import { screenOutResearchAttempt } from './flow.screen-out.service'
import { SurveyAssignmentError } from './flow.assignment'
import { readSurveyCheckpoint,saveSurveyCheckpoint,clearSurveyCheckpoint,SurveyCheckpointError } from './checkpoint.service'
import { ResearchIdentityError,revokeLinkedResearchAccess,withdrawLinkedResearchData,withdrawSingleResearchAttempt } from './identity.service'
import { SurveyFinalValidationError } from './final.compute'
import { getOwnResearchTask } from './task.public'
import { resolveSurveyPublicId } from './public-project'
import * as admission from './admission.service'
import { serveAssessmentImageContent,AssessmentImageDeliveryError } from '../assessment-media/assessment-image-delivery'
import { surveyCognitiveRouter } from './cognitive.public.routes'
import { SurveyCognitiveError } from './cognitive.results'
import { surveyCognitiveReferenceSchema } from './cognitive.definition'
import type { AssessmentStaticImageAssetIdentityV1 } from '../assessment-media/assessment-image'

export const publicSurveyRouter=Router()
publicSurveyRouter.use((_req,res,next)=>{
  res.setHeader('Cache-Control','no-store')
  res.setHeader('Referrer-Policy','no-referrer')
  next()
})
// Only a current server-authorized group wave may bypass this shared IP bucket.
// The exemption is not participant authorization; all handlers retain their fences.
publicSurveyRouter.use(createSurveyPublicRateLimiter())
const id=z.string().guid(), secret=z.string().regex(/^[A-Za-z0-9_-]{43}$/)
const code=z.string().regex(/^R-[A-Z0-9]{8,32}$/)
const consent=z.object({consent:z.literal(true),consentVersion:z.number().int().positive()})
const entry=consent.extend({entryToken:secret}).strict()
const linked=consent.extend({researchCode:code,accessCredential:secret}).strict()
const identity=z.object({researchCode:code,accessCredential:secret}).strict()
const proof=z.object({researchCode:code.optional(),accessCredential:secret}).strict()
const checkpointWrite=proof.extend({revision:z.number().int().min(0).max(100),
  answers:z.record(z.string(), z.record(z.string(), z.unknown())),
  itemTimings:z.record(z.string(), z.record(z.string(), z.unknown())).optional()}).strict()
const submission=proof.extend({submissionId:z.string().min(16).max(200),
  cognitiveReferences:z.array(surveyCognitiveReferenceSchema).max(4).optional(),
  answers:z.record(z.string(), z.record(z.string(), z.unknown())),
  itemTimings:z.record(z.string(), z.record(z.string(), z.unknown())).optional(),
  presentation:z.object({shownBlocks:z.array(z.string().regex(/^[a-z][a-z0-9_-]{0,79}$/)).max(70)}).strict().optional()}).strict()
const handle=(action:(req:Request)=>Promise<unknown>)=>async(req:Request,res:Response,next:NextFunction)=>{
  try{return success(res,await action(req))}
  catch(e){
    if(e instanceof BoundedAdmissionBusyError)return error(res,'编码验证繁忙，请稍后再试',-1,503)
    if(e instanceof z.ZodError)return error(res,'输入不合法',-1,400)
    if(e instanceof SurveyWaveError||e instanceof SurveyFinalError||e instanceof ResearchIdentityError||e instanceof SurveyCognitiveError)
      return error(res,e.message,-1,e.statusCode)
    if(e instanceof SurveyFinalValidationError)return error(res,e.path+'：'+e.message,-1,400)
    if(e instanceof SurveyAssignmentError)return error(res,e.message,-1,409)
    if(e instanceof ScaleLibraryError)return error(res,e.message,-1,e.statusCode)
    if(e instanceof SurveyCheckpointError)return error(res,e.message,-1,e.statusCode)
    next(e)
  }
}
publicSurveyRouter.use('/r/:publicId/attempts/:attemptId/cognitive',surveyCognitiveRouter)
publicSurveyRouter.get('/r/:publicId/info',handle(req=>
  admission.getPublicResearchInfo(id.parse(req.params.publicId))))
publicSurveyRouter.post('/r/:publicId/info',handle(req=>
  admission.getPublicResearchInfo(id.parse(req.params.publicId),
    z.object({entryToken:secret}).strict().parse(req.body).entryToken)))
publicSurveyRouter.post('/r/:publicId/waves/:waveId/join',handle(req=>
  admission.joinLinkedStudy({publicId:id.parse(req.params.publicId),
    waveId:id.parse(req.params.waveId),...entry.parse(req.body)})))
publicSurveyRouter.post('/r/:publicId/enter',handle(req=>
  admission.listOwnLinkedWaves({publicId:id.parse(req.params.publicId),...identity.extend({waveId:id.optional()}).parse(req.body)})))
publicSurveyRouter.post('/r/:publicId/waves/:waveId/start',handle(req=>
  admission.startLinkedWave({publicId:id.parse(req.params.publicId),
    waveId:id.parse(req.params.waveId),...linked.parse(req.body)})))
publicSurveyRouter.post('/r/:publicId/waves/:waveId/start-unlinked',handle(req=>
  admission.startSingleUnlinkedWave({publicId:id.parse(req.params.publicId),
    waveId:id.parse(req.params.waveId),...entry.parse(req.body)})))
publicSurveyRouter.post('/r/:publicId/attempts/:attemptId/task',handle(req=>
  getOwnResearchTask({publicId:id.parse(req.params.publicId),
    attemptId:id.parse(req.params.attemptId),...proof.parse(req.body)})))
const checkProof=(req:Request,params:{accessCredential:string;researchCode?:string})=>({
  publicId:id.parse(req.params.publicId),attemptId:id.parse(req.params.attemptId),...params,
})
publicSurveyRouter.post('/r/:publicId/attempts/:attemptId/checkpoint/read',handle(req=>
  readSurveyCheckpoint(checkProof(req,proof.parse(req.body)))))
publicSurveyRouter.post('/r/:publicId/attempts/:attemptId/checkpoint/save',handle(req=>{
  const body=checkpointWrite.parse(req.body)
  return saveSurveyCheckpoint(checkProof(req,body),{
    revision:body.revision,answers:body.answers,itemTimings:body.itemTimings,
  })
}))
publicSurveyRouter.post('/r/:publicId/attempts/:attemptId/checkpoint/clear',handle(req=>
  clearSurveyCheckpoint(checkProof(req,proof.parse(req.body)))))
publicSurveyRouter.post('/r/:publicId/attempts/:attemptId/final',handle(req=>
  submitResearchFinal({publicId:id.parse(req.params.publicId),
    attemptId:id.parse(req.params.attemptId),...submission.parse(req.body)})))
publicSurveyRouter.post('/r/:publicId/attempts/:attemptId/screen-out',handle(req=>
  screenOutResearchAttempt({publicId:id.parse(req.params.publicId),
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

/** Only selected frozen materials or actually released feedback are disclosed. */
for(const purpose of ['materials','report-materials'] as const){
  publicSurveyRouter.post('/r/:publicId/attempts/:attemptId/'+purpose+'/:assetId',async(req,res,next)=>{
    try{
      const input={publicId:id.parse(req.params.publicId),attemptId:id.parse(req.params.attemptId),...proof.parse(req.body)}
      const assetId=id.parse(req.params.assetId)
      const reference=await authorizeSurveyMaterial(input,assetId,purpose)
      return await serveSurveyMaterial(reference,res)
    }catch(cause){
      if(cause instanceof z.ZodError||cause instanceof SurveyWaveError||cause instanceof SurveyFinalError||cause instanceof ResearchIdentityError||cause instanceof SurveyAssignmentError||cause instanceof SurveyMediaError)return res.status(404).end()
      next(cause)
    }
  })
}

/** POST because participant recovery credentials must never appear in URL,
 * query parameters or referer; response bytes are never publicly cacheable.
 */
publicSurveyRouter.post('/r/:publicId/attempts/:attemptId/images/:assetId',
  async(req,res,next)=>{
    try{
      const params=proof.parse(req.body)
      const reference=await authorizeOwnSurveyImage({
        publicId:id.parse(req.params.publicId),attemptId:id.parse(req.params.attemptId),...params,
      },id.parse(req.params.assetId))
      res.setHeader('Cache-Control','private, no-store, max-age=0')
      res.setHeader('X-Content-Type-Options','nosniff')
      return await serveAssessmentImageContent({
        reference:reference as AssessmentStaticImageAssetIdentityV1,res,
      })
    }catch(e){
      if(e instanceof z.ZodError||e instanceof SurveyWaveError
        ||e instanceof ResearchIdentityError||e instanceof AssessmentImageDeliveryError||e instanceof SurveyAssignmentError)
        return res.status(404).end()
      next(e)
    }
  })

/** Native video GET/Range cannot carry the recovery proof. Exchange it here,
 * after frozen-task membership and retention checks, for existing signed media capabilities. */
publicSurveyRouter.post('/r/:publicId/attempts/:attemptId/scale-media/:instrumentKey/:itemKey/video-capabilities',async(req,res,next)=>{
  try{
    const key=z.string().regex(/^[a-z][a-z0-9_-]{0,79}$/)
    const sources=await issueOwnSurveyScaleVideo({publicId:id.parse(req.params.publicId),attemptId:id.parse(req.params.attemptId),...proof.parse(req.body)},
      key.parse(req.params.instrumentKey),key.parse(req.params.itemKey))
    return success(res,sources)
  }catch(e){
    if(e instanceof z.ZodError||e instanceof SurveyWaveError||e instanceof ResearchIdentityError||
      e instanceof SurveyAssignmentError||e instanceof AssessmentMediaCapabilityError||e instanceof AssessmentAssetValidationError)
      return res.status(404).end()
    next(e)
  }
})

/** Reuse the exact current report disclosure check. A valid attempt alone is
 * insufficient: only image identities in its released saved feedback qualify. */
publicSurveyRouter.post('/r/:publicId/attempts/:attemptId/report-images/:assetId',async(req,res,next)=>{
  try{
    const params=proof.parse(req.body)
    const report=await readGeneralForOwnAttempt({publicId:id.parse(req.params.publicId),
      attemptId:id.parse(req.params.attemptId),...params})
    const assetId=id.parse(req.params.assetId)
    const measurements='measurements' in report?report.measurements:[]
    const reference=measurements.flatMap(measurement=>
      'rawScoreFeedback' in measurement?(measurement.rawScoreFeedback??[]).flatMap(feedback=>feedback.images??[]):[])
      .find(image=>image.asset.assetId===assetId)?.asset
    if(!reference)return res.status(404).end()
    res.setHeader('Cache-Control','private, no-store, max-age=0')
    await serveAssessmentImageContent({reference,res})
  }catch(e){
    if(e instanceof z.ZodError||e instanceof SurveyWaveError||e instanceof SurveyFinalError
      ||e instanceof ResearchIdentityError||e instanceof AssessmentImageDeliveryError)return res.status(404).end()
    next(e)
  }
})

publicSurveyRouter.post('/r/:publicId/waves/:waveId/join-code',memorableCodeRateLimit,handle(req=>joinMemorableStudy({
 publicId:id.parse(req.params.publicId),waveId:id.parse(req.params.waveId),...entry.extend({prefix:z.string().max(40),suffix:z.string().max(20)}).strict().parse(req.body),
})))
publicSurveyRouter.post('/r/:publicId/enter-code',memorableCodeRateLimit,handle(async req=>{
 const input=z.object({fullCode:z.string().max(64),waveId:id.optional()}).strict().parse(req.body),publicId=id.parse(req.params.publicId)
 const identity=await recoverMemorableIdentity(publicId,input.fullCode)
 if(identity.revoked)return {...identity,waves:[]}
 return {...identity,...await admission.listOwnLinkedWaves({publicId,...identity,...(input.waveId?{waveId:input.waveId}:{})})}
}))
publicSurveyRouter.post('/r/:publicId/reset-code',memorableCodeRateLimit,handle(req=>{
 const input=z.object({resetCode:z.string().max(64),suffix:z.string().max(20)}).strict().parse(req.body)
 return completeMemorableReset(id.parse(req.params.publicId),input.resetCode,input.suffix)
}))

// Old clients may not turn an arbitrary chosen string into an authentication secret.
publicSurveyRouter.post('/r/:publicId/waves/:waveId/join-self-code',(_req,res)=>{
 return error(res,'自拟编码已停用，请刷新页面领取随机研究编码。',-1,410)
})
// Ordinary public-IP admission applies; there is no credential to guess at enrollment.
publicSurveyRouter.post('/r/:publicId/waves/:waveId/join-random-code',handle(req=>joinGeneratedCodeStudy({
 publicId:id.parse(req.params.publicId),waveId:id.parse(req.params.waveId),...entry.parse(req.body),
})))
