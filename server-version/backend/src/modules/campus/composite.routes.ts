import { Router, type Request,type Response,type NextFunction } from 'express'
import { Prisma } from '@prisma/client'
import { prisma } from '../../config/database'
import { authenticateSchool } from '../../middleware/auth'
import { notFound, instrumentError } from '../../utils/response'
import { currentRunPopulationAuthoritySql } from '../assessment-run/currentPopulationAuthority'
import { compositeController } from '../composite/composite.controller'
import { compositeImageController } from '../composite/composite-image.controller'
import { compositeVideoController } from '../composite/composite-video.controller'
import { situationalVideoController } from '../situational/situational-video.controller'
import { relationalRuntimeConsentAuthority } from '../assessment-relational/runtime-consent'
import { RelationalAssessmentError } from '../assessment-relational/errors'

/** School-only canonical Composite runtime. A browser never switches to the
 * legacy ptool_session to answer a campus Run. Every read and write is bound
 * to the frozen execution/respondent and current PR1+Activity policy.
 * Attempt IDs are never sufficient proof of authority.
 */
const router=Router()
router.use((_req,res,next)=>{res.setHeader('Cache-Control','no-store');next()})
async function campusCompositeAccess(req:Request,res:Response,next:NextFunction){
  try {
    const attemptId=req.params.attemptId
    if(!req.user||req.user.accountDomain!=='SCHOOL'||!attemptId)
      return notFound(res,'当前校园测评不可访问')
    const rows=await prisma.$queryRaw<Array<{id:string}>>(Prisma.sql`
      SELECT e."id" FROM "assessment_run_executions" e
      JOIN "assessment_run_actor_snapshots" respondent
        ON respondent."id"=e."respondent_actor_snapshot_id"
        AND respondent."organization_id"=e."organization_id"
        AND respondent."run_id"=e."run_id"
      JOIN "campus_activity_runs" ca ON ca."run_id"=e."run_id"
        AND ca."organization_id"=e."organization_id"
      WHERE e."runtime_binding_kind"='COMPOSITE'
        AND e."runtime_binding_ref"=${attemptId}
        AND respondent."user_id"=${req.user.userId}
        AND ${currentRunPopulationAuthoritySql(Prisma.sql`e."id"`)}
      LIMIT 1
    `)
    if(!rows.length)return notFound(res,'当前校园测评不可访问')
    return next()
  }catch(error){return next(error)}
}
async function campusFinalConsent(req:Request,res:Response,next:NextFunction){
  try{
    if(!req.user)return notFound(res)
    await relationalRuntimeConsentAuthority.assertCompositeFinal(
      req.params.attemptId,req.user.userId)
    next()
  }catch(error){
    if(error instanceof RelationalAssessmentError)
      return instrumentError(res,error.code,error.message,403)
    next(error)
  }
}
router.get('/composite-attempts/:attemptId',authenticateSchool,campusCompositeAccess,
  compositeController.getAttempt)
router.get('/composite-attempts/:attemptId/form-sections/:sectionId/assets/:assetId/content',
  authenticateSchool,campusCompositeAccess,compositeImageController.authenticatedFormImage)
router.get('/composite-attempts/:attemptId/items/:itemId/scale/assets/:assetId/content',
  authenticateSchool,campusCompositeAccess,compositeImageController.authenticatedScaleImage)
router.post('/composite-attempts/:attemptId/form-sections/:sectionId/items/:itemId/options/:optionIndex/video-capability',
  authenticateSchool,campusCompositeAccess,compositeVideoController.authenticatedFormVideo)
router.post('/composite-attempts/:attemptId/items/:itemId/scale/items/:itemCode/video-capability',
  authenticateSchool,campusCompositeAccess,compositeVideoController.authenticatedScaleVideo)
router.post('/composite-attempts/:attemptId/form-sections/:sectionId/submit',
  authenticateSchool,campusCompositeAccess,campusFinalConsent,
  compositeController.submitFinalFormSection)
router.post('/composite-attempts/:attemptId/items/:itemId/scale/submit',
  authenticateSchool,campusCompositeAccess,campusFinalConsent,
  compositeController.submitFinalScale)
router.get('/composite-attempts/:attemptId/items/:itemId/situational/:situationalAttemptId',
  authenticateSchool,campusCompositeAccess,compositeController.getEmbeddedSituational)
router.get('/composite-attempts/:attemptId/items/:itemId/situational/:situationalAttemptId/assets/:assetId/content',
  authenticateSchool,campusCompositeAccess,compositeController.embeddedSituationalAsset)
router.get('/composite-attempts/:attemptId/items/:itemId/situational/:situationalAttemptId/scenes/:sceneKey/video-sources',
  authenticateSchool,campusCompositeAccess,situationalVideoController.embeddedAuthenticated)
router.post('/composite-attempts/:attemptId/items/:itemId/situational/:situationalAttemptId/submit',
  authenticateSchool,campusCompositeAccess,campusFinalConsent,
  compositeController.submitEmbeddedSituational)

export default router
