import { Router, type Request,type Response,type NextFunction } from 'express'
import { Prisma } from '@prisma/client'
import { prisma } from '../../config/database'
import { authenticateSchool } from '../../middleware/auth'
import { notFound, instrumentError, success, assessmentSubmitBusy, completionBusy } from '../../utils/response'
import { cognitiveImageController } from '../cognitive/cognitive-image.controller'
import { cognitiveVideoController } from '../cognitive/cognitive-video.controller'
import { getSession as getCognitiveSession } from '../cognitive/session.service'
import { finalCognitiveSubmitSchema } from '../cognitive/cognitive.schema'
import { submitCognitiveSessionFinalWithContext } from '../cognitive/final-submit.service'
import { isInstrumentFinalSubmitError } from '../../services/instrumentFinalSubmit'
import { isUnitSubmitAdmissionBusyError } from '../../services/unitSubmitAdmission'
import {
  isQuestionnaireCompletionAdmissionBusyError,
  isTransientCompletionDatabaseError,
} from '../../services/questionnaireCompletionAdmission'
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
/** A Cognitive task is an existing FINAL_ONLY child of the frozen Composite,
 * not a new Cognitive Run family or a standalone legacy assignment.
 * The parent guard above supplies current school/Run/Activity authorization;
 * this guard prevents a different subject, child slot, session or respondent
 * from being substituted, even if the caller learned a valid child ID.
 *
 * PR scope deliberately supports STUDENT self-report only. The policy and
 * data model must be separately reviewed before other informants are allowed.
 */
async function campusCognitiveChildAccess(req:Request,res:Response,next:NextFunction){
  try{
    if(req.user?.accountDomain!=='SCHOOL'||req.user.role!=='STUDENT')
      return notFound(res,'当前校园认知测评不可访问')
    const rows=await prisma.$queryRaw<Array<{id:string}>>(Prisma.sql`
      SELECT child.id
      FROM cognitive_sessions child
      JOIN composite_assessment_attempts parent
        ON parent.id=child.composite_attempt_id
      JOIN composite_assessment_items slot
        ON slot.id=child.composite_item_id
        AND slot.composite_assessment_id=parent.composite_assessment_id
      JOIN assessment_run_executions execution
        ON execution.runtime_binding_kind='COMPOSITE'
        AND execution.runtime_binding_ref=parent.id
      JOIN assessment_run_actor_snapshots subject
        ON subject.id=execution.subject_actor_snapshot_id
        AND subject.organization_id=execution.organization_id
        AND subject.run_id=execution.run_id
      JOIN assessment_run_actor_snapshots respondent
        ON respondent.id=execution.respondent_actor_snapshot_id
        AND respondent.organization_id=execution.organization_id
        AND respondent.run_id=execution.run_id
      JOIN relational_assessment_assignments assignment
        ON assignment.id=execution.relational_assignment_id
        AND assignment.policy_domain='ORGANIZATION_RUN'
      WHERE child.id=${req.params.sessionId}
        AND child.composite_attempt_id=${req.params.attemptId}
        AND child.composite_item_id=${req.params.itemId}
        AND child.user_id=${req.user.userId}
        AND parent.user_id=${req.user.userId}
        AND child.delivery_mode='FINAL_ONLY'
        AND parent.delivery_mode='FINAL_ONLY'
        AND parent.status IN ('IN_PROGRESS','COMPLETED')
        AND slot.type='COGNITIVE'
        AND subject.user_id=${req.user.userId}
        AND respondent.user_id=${req.user.userId}
        AND subject.actor_role='STUDENT'
        AND respondent.actor_role='STUDENT'
        AND assignment.relationship_kind='SELF'
        AND assignment.perspective='SELF_REPORT'
      LIMIT 1
    `)
    if(rows.length!==1)return notFound(res,'当前校园认知测评不可访问')
    return next()
  }catch(error){return next(error)}
}
async function campusCognitiveFinalConsent(req:Request,res:Response,next:NextFunction){
  try{
    if(!req.user)return notFound(res)
    await relationalRuntimeConsentAuthority.assertCompositeFinal(
      req.params.attemptId,req.user.userId)
    await relationalRuntimeConsentAuthority.assertCognitiveFinal(
      req.params.sessionId,req.user.userId)
    return next()
  }catch(error){
    if(error instanceof RelationalAssessmentError)
      return instrumentError(res,error.code,error.message,403)
    return next(error)
  }
}
async function readCampusCognitiveChild(req:Request,res:Response,next:NextFunction){
  try{
    const payload=await getCognitiveSession(req.user!.userId,req.params.sessionId) as unknown as Record<string,unknown>
    // The shared Cognitive completed result may include scores, metrics, reference
    // bands and professional interpretations. SCHOOL has no approved student
    // metric narratives; keep the child visible only as a completion receipt.
    if(payload.status==='COMPLETED'){
      const {result,score,metrics,qualityFlags,reference,references,report,singleTaskReport,...safe}=payload
      return success(res,{...safe,feedbackDeferred:true})
    }
    return success(res,payload)
  }catch(error){return next(error)}
}
const withCognitiveSessionId=(handler:(req:Request,res:Response)=>Promise<unknown>)=>
  (req:Request,res:Response,next:NextFunction)=>{
    req.params.id=req.params.sessionId
    void Promise.resolve().then(()=>handler(req,res)).catch(next)
  }
async function submitCampusCognitiveChild(req:Request,res:Response,next:NextFunction){
  try{
    const parsed=finalCognitiveSubmitSchema.safeParse(req.body)
    if(!parsed.success)return res.status(400).json({
      code:'CAMPUS_COGNITIVE_FINAL_INVALID',message:'认知提交参数不正确',data:null,
    })
    const {data}=await submitCognitiveSessionFinalWithContext(req.user!.userId,{
      sessionId:req.params.sessionId,...parsed.data,
    })
    // Canonical scoring, immutable FINAL and parent Run reconciliation are
    // performed by the existing service. Do not return any unreviewed numbers.
    return success(res,{completed:true,feedbackDeferred:true,replayed:data.replayed===true})
  }catch(error){
    if(isUnitSubmitAdmissionBusyError(error))
      return assessmentSubmitBusy(res,error.retryAfterSeconds)
    if(isQuestionnaireCompletionAdmissionBusyError(error))
      return completionBusy(res,error.retryAfterSeconds)
    if(isTransientCompletionDatabaseError(error))
      return completionBusy(res,1)
    if(isInstrumentFinalSubmitError(error))
      return instrumentError(res,error.code,error.message,error.statusCode)
    return next(error)
  }
}
const campusCognitivePrefix='/composite-attempts/:attemptId/items/:itemId/cognitive/:sessionId'
// No standalone /sessions, restart, trial-stream, history, report or export
// surfaces are mounted in SCHOOL. Every endpoint goes through BOTH guards.
router.get(campusCognitivePrefix,authenticateSchool,campusCompositeAccess,
  campusCognitiveChildAccess,readCampusCognitiveChild)
router.get(campusCognitivePrefix+'/assets/:assetId/content',
  authenticateSchool,campusCompositeAccess,campusCognitiveChildAccess,
  withCognitiveSessionId(cognitiveImageController.content))
router.post(campusCognitivePrefix+'/video-capabilities',
  authenticateSchool,campusCompositeAccess,campusCognitiveChildAccess,
  withCognitiveSessionId(cognitiveVideoController.issue))
router.post(campusCognitivePrefix+'/submit',
  authenticateSchool,campusCompositeAccess,campusCognitiveChildAccess,
  campusCognitiveFinalConsent,submitCampusCognitiveChild)

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
