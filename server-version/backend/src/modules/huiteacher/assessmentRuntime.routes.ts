import {readTeacherPersonalChanges} from '../reporting/teacher-personal-changes.service'
import {ContentAuthorityError} from '../measurement-content/content-authority'
import {readTeacherOrdinaryFeedback} from '../reporting/education-ordinary-feedback.service'
import {serveProjectedReportImage} from '../reporting/report-image-delivery'
import {assessmentAssetIdSchema} from '../assessment-media/assessment-asset-identity'
import {Router,type Request,type Response,type NextFunction,type RequestHandler} from 'express'
import {z,ZodError} from 'zod'
import {prisma} from '../../config/database'
import {authenticateHuiteacher} from '../../middleware/auth'
import {success,assessmentSubmitBusy,completionBusy,instrumentError} from '../../utils/response'
import {isInstrumentFinalSubmitError} from '../../services/instrumentFinalSubmit'
import {isUnitSubmitAdmissionBusyError} from '../../services/unitSubmitAdmission'
import {isQuestionnaireCompletionAdmissionBusyError,isTransientCompletionDatabaseError} from '../../services/questionnaireCompletionAdmission'
import {startAssessmentRunExecution} from '../assessment-run/startExecution'
import {acceptRunExecutionConsent} from '../assessment-run/consent'
import {relationalRuntimeConsentAuthority} from '../assessment-relational/runtime-consent'
import {compositeController} from '../composite/composite.controller'
import {getAttemptState} from '../composite/composite.service'
import {compositeImageController} from '../composite/composite-image.controller'
import {compositeVideoController} from '../composite/composite-video.controller'
import {getSession} from '../cognitive/session.service'
import {finalCognitiveSubmitSchema} from '../cognitive/cognitive.schema'
import {submitCognitiveSessionFinalWithContext} from '../cognitive/final-submit.service'
import {cognitiveImageController} from '../cognitive/cognitive-image.controller'
import {cognitiveVideoController} from '../cognitive/cognitive-video.controller'
import {loadEmbeddedSituationalAttemptRuntime,situationalAttemptForResponse} from '../situational/situational-runtime.service'
import {situationalFinalSubmitSchema} from '../situational/situational-final-submit.schema'
import {submitSituationalAttemptFinal} from '../situational/situational-final-submit.service'
import {situationalVideoController} from '../situational/situational-video.controller'
import {compositeItemSlotKey} from '../assessment-runtime/slot-set'
import {createTeacherAssessmentAccess,TeacherAssessmentRuntimeError,type TeacherAssessmentSourceAccess,type TeacherSourceIdentity,type TeacherRuntimeDb} from './assessmentRuntime.access'

const uuid=z.string().guid()
const pick=(value:Record<string,unknown>,keys:readonly string[])=>Object.fromEntries(keys.filter(key=>key in value).map(key=>[key,value[key]]))
/** Runner data only. Report availability and descriptive metrics belong to the
 * independently authorized Teacher report endpoint, including after FINAL. */
export function projectTeacherCognitiveRuntime(value:Record<string,unknown>){
 const keys=['sessionId','assignmentId','testType','attemptNo','attemptEpoch','deliveryMode','definitionHash','contextSnapshotHash',
  'status','configVersion','engineVersion','scoringVersion','protocolSignature','protocol','presentation','config','randomSeed','profile','finishedAt']
 return {...pick(value,value.status==='COMPLETED'?['sessionId','testType','status','deliveryMode','definitionHash','engineVersion','finishedAt']:keys),feedbackDeferred:true}
}
export function projectTeacherSituationalRuntime(value:Record<string,unknown>){
 const attempt=value.attempt as Record<string,unknown>,instrument=value.instrument as Record<string,unknown>
 return {...pick(value,['attemptId','replayed']),attempt:pick(attempt,['id','compositeAttemptId','instrumentKey','instrumentVersion','attemptNo','status',
  'deliveryMode','runtimeGeneration','attemptEpoch','progress','definitionHash','compiledRuntimeHash','scorerKey','scoringVersion','submissionId',
  'submissionPayloadHash','submittedAt','startedAt','completedAt','totalTime','createdAt','updatedAt']),
  instrument:pick(instrument,['title','key','version','definitionHash','compiledRuntimeHash','scorerKey','scoringVersion','frozenAt','online',
   'releaseStatus','sampling','definition','runtimeCapabilities','assignment']),feedbackDeferred:true}
}
export function projectTeacherCompositeRuntime(value:Awaited<ReturnType<typeof getAttemptState>>){
 const {trainingPersistence:_p,checkpointDefinitionHash:_c,...state}=value
 if(state.currentItem?.cognitiveSession){
  return {...state,currentItem:{...state.currentItem,cognitiveSession:projectTeacherCognitiveRuntime(state.currentItem.cognitiveSession as unknown as Record<string,unknown>)}}
 }
 return state
}
function runtimeError(error:unknown,res:Response,next:NextFunction){
 if(error instanceof ContentAuthorityError&&error.code==='CONTENT_AUTHORITY_DENIED')return res.status(403).json({code:error.code,message:'当前教师测评分发授权已不可用',data:null})
 if(error instanceof ZodError)return res.status(400).json({code:'HUITEACHER_ASSESSMENT_INPUT_INVALID',message:'教师测评参数无效',data:null})
 if(isUnitSubmitAdmissionBusyError(error))return assessmentSubmitBusy(res,error.retryAfterSeconds)
 if(isQuestionnaireCompletionAdmissionBusyError(error))return completionBusy(res,error.retryAfterSeconds)
 if(isTransientCompletionDatabaseError(error))return completionBusy(res,1)
 if(isInstrumentFinalSubmitError(error))return instrumentError(res,error.code,error.message,error.statusCode)
 const known=error as {statusCode?:number;code?:string}
 if(known&&typeof known.statusCode==='number'&&known.statusCode>=400&&known.statusCode<500)
  return res.status(known.statusCode).json({code:known.code??'HUITEACHER_ASSESSMENT_UNAVAILABLE',message:'当前教师测评资格、资源或状态不满足要求',data:null})
 return next(error)
}
const handler=(work:(req:Request,res:Response)=>Promise<unknown>):RequestHandler=>(req,res,next)=>{
 void Promise.resolve().then(()=>work(req,res)).catch(error=>runtimeError(error,res,next))
}
const wrapped=(work:(req:Request)=>Promise<unknown>)=>handler(async(req,res)=>success(res,await work(req)))
const embedded=(req:Request)=>({userId:req.user!.userId,compositeAttemptId:req.params.attemptId,
 compositeItemId:req.params.itemId,compositeSlotKey:compositeItemSlotKey(req.params.itemId,'SITUATIONAL')})

/** Deliberately requires both the root identity reader and current-use checker.
 * Never mount with an identity-only checker or a fabricated grant. */
export function createTeacherAssessmentRuntimeRouter<Identity extends TeacherSourceIdentity>(source:TeacherAssessmentSourceAccess<Identity>,db:TeacherRuntimeDb=prisma,audience:import('./assessmentRuntime.access').TeacherAssessmentAudience='TEACHER_SELF'){
 const router=Router(),access=createTeacherAssessmentAccess(db,source,audience)
 router.use((_req,res,next)=>{res.setHeader('Cache-Control','no-store');next()})
 // Authentication itself validates the HUITEACHER credential audience; this
 // separate current-account check prevents an accidental non-Teacher mount.
 router.use(['/my-assessment-tasks','/run-executions/:executionId/assessment-consent/accept',
  '/run-executions/:executionId/start-assessment','/run-executions/:executionId/changes','/run-executions/:executionId/feedback','/assessment-composite-attempts/:attemptId'],authenticateHuiteacher,(req,res,next)=>{
  if(audience==='STUDENT_EVALUATION'&&process.env.HUITEACHER_STUDENT_FEEDBACK_ENABLED!=='true')
   return runtimeError(new TeacherAssessmentRuntimeError(),res,next)
  if(req.user?.accountDomain!=='SCHOOL'||(audience==='STUDENT_EVALUATION'?req.user.role!=='STUDENT':!['TEACHER','ADMIN'].includes(req.user.role)))
   return runtimeError(new TeacherAssessmentRuntimeError(),res,next)
  next()
 })
 const attemptAccess:RequestHandler=(req,res,next)=>{
  void Promise.resolve().then(()=>access.own(req.user!.userId,{attemptId:uuid.parse(req.params.attemptId)}))
   .then(()=>relationalRuntimeConsentAuthority.assertCompositeFinal(req.params.attemptId,req.user!.userId))
   .then(()=>next()).catch(error=>runtimeError(error,res,next))
 }
 const childAccess=(type:'COGNITIVE'|'SITUATIONAL'|'SCALE'|'FORM_SECTION'):RequestHandler=>(req,res,next)=>{
  void Promise.resolve().then(()=>access.child(req.user!.userId,{
   attemptId:uuid.parse(req.params.attemptId),itemId:uuid.parse(type==='FORM_SECTION'?req.params.sectionId:req.params.itemId),type,
   ...(type==='COGNITIVE'?{sessionId:uuid.parse(req.params.sessionId)}:{}),
   ...(type==='SITUATIONAL'?{situationalAttemptId:uuid.parse(req.params.situationalAttemptId)}:{}),
  })).then(()=>relationalRuntimeConsentAuthority.assertCompositeFinal(req.params.attemptId,req.user!.userId))
   .then(()=>next()).catch(error=>runtimeError(error,res,next))
 }
 const finalConsent:RequestHandler=(req,res,next)=>{
  void Promise.resolve().then(async()=>{
   await relationalRuntimeConsentAuthority.assertCompositeFinal(req.params.attemptId,req.user!.userId)
   if(req.params.sessionId)await relationalRuntimeConsentAuthority.assertCognitiveFinal(req.params.sessionId,req.user!.userId)
  }).then(()=>next()).catch(error=>runtimeError(error,res,next))
 }
 router.get('/my-assessment-tasks',wrapped(req=>access.page(req.user!.userId,req.query)))
 router.post('/run-executions/:executionId/changes',wrapped(req=>{
  if(audience!=='TEACHER_SELF')throw new TeacherAssessmentRuntimeError()
  return readTeacherPersonalChanges({actorUserId:req.user!.userId,executionId:uuid.parse(req.params.executionId)})
 }))
 router.get('/run-executions/:executionId/feedback',wrapped(req=>{
  if(Object.keys(req.query).length)throw new TeacherAssessmentRuntimeError()
  return readTeacherOrdinaryFeedback({executionId:uuid.parse(req.params.executionId),actorUserId:req.user!.userId})
 }))
 router.get('/run-executions/:executionId/feedback/images/:assetId',handler(async(req,res)=>{
  if(Object.keys(req.query).length)throw new TeacherAssessmentRuntimeError()
  const report=await readTeacherOrdinaryFeedback({executionId:uuid.parse(req.params.executionId),actorUserId:req.user!.userId})
  const assetId=assessmentAssetIdSchema.parse(req.params.assetId)
  return serveProjectedReportImage({unitReports:report.units.flatMap(unit=>'nativeScaleUnits' in unit?unit.nativeScaleUnits:[])},assetId,res)
 }))
 router.post('/run-executions/:executionId/assessment-consent/accept',wrapped(async req=>{
  const executionId=uuid.parse(req.params.executionId),proof=await access.own(req.user!.userId,{executionId})
  if(proof.task.status!=='ASSIGNED'||!proof.task.consentRequired)throw new TeacherAssessmentRuntimeError()
  return acceptRunExecutionConsent({executionId,actorUserId:req.user!.userId})
 }))
 router.post('/run-executions/:executionId/start-assessment',wrapped(async req=>{
  const executionId=uuid.parse(req.params.executionId),proof=await access.own(req.user!.userId,{executionId})
  // Resume the exact durable binding without re-running new-intake admission.
  // All current product/source/actor/consent checks still run on subsequent reads.
  if(proof.task.runtimeBindingRef){
   await relationalRuntimeConsentAuthority.assertCompositeFinal(proof.task.runtimeBindingRef,req.user!.userId)
   return {state:'STARTED',runtimeBindingKind:'COMPOSITE',runtimeBindingRef:proof.task.runtimeBindingRef,replayed:true}
  }
  const result=await startAssessmentRunExecution({executionId,actorUserId:req.user!.userId})
  if(result.state==='STARTED'){
   if(result.runtimeBindingKind!=='COMPOSITE')throw new TeacherAssessmentRuntimeError()
   // Re-read the actual persisted Run binding, not just the adapter response.
   await access.own(req.user!.userId,{executionId,attemptId:result.runtimeBindingRef})
  }
  return result
 }))
 const parent='/assessment-composite-attempts/:attemptId'
 router.get(parent,attemptAccess,wrapped(async req=>projectTeacherCompositeRuntime(
  await getAttemptState(req.params.attemptId,{userId:req.user!.userId},undefined,'current-unit'))))
 router.get(parent+'/form-sections/:sectionId/assets/:assetId/content',childAccess('FORM_SECTION'),compositeImageController.authenticatedFormImage)
 router.post(parent+'/form-sections/:sectionId/items/:itemId/options/:optionIndex/video-capability',childAccess('FORM_SECTION'),compositeVideoController.authenticatedFormVideo)
 router.post(parent+'/form-sections/:sectionId/submit',childAccess('FORM_SECTION'),finalConsent,compositeController.submitFinalFormSection)
 router.get(parent+'/items/:itemId/scale/assets/:assetId/content',childAccess('SCALE'),compositeImageController.authenticatedScaleImage)
 router.post(parent+'/items/:itemId/scale/items/:itemCode/video-capability',childAccess('SCALE'),compositeVideoController.authenticatedScaleVideo)
 // A receipt cannot authorize a Scale report. Preserve canonical FINAL and its
 // busy/replay protocol while forcing the existing lightweight response form.
 router.post(parent+'/items/:itemId/scale/submit',childAccess('SCALE'),finalConsent,(req,res,next)=>{
  req.query.response='receipt';void compositeController.submitFinalScale(req,res).catch(next)
 })
 const cognitive=parent+'/items/:itemId/cognitive/:sessionId'
 const cognitiveController=(work:(req:Request,res:Response)=>Promise<unknown>)=>handler(async(req,res)=>{
  req.params.id=req.params.sessionId;return work(req,res)
 })
 router.get(cognitive,childAccess('COGNITIVE'),wrapped(async req=>projectTeacherCognitiveRuntime(
  await getSession(req.user!.userId,req.params.sessionId) as unknown as Record<string,unknown>)))
 router.get(cognitive+'/assets/:assetId/content',childAccess('COGNITIVE'),cognitiveController(cognitiveImageController.content))
 router.post(cognitive+'/video-capabilities',childAccess('COGNITIVE'),cognitiveController(cognitiveVideoController.issue))
 router.post(cognitive+'/submit',childAccess('COGNITIVE'),finalConsent,wrapped(async req=>{
  const parsed=finalCognitiveSubmitSchema.parse(req.body)
  const {data}=await submitCognitiveSessionFinalWithContext(req.user!.userId,{sessionId:req.params.sessionId,...parsed})
  return {completed:true,feedbackDeferred:true,replayed:data.replayed===true}
 }))
 const sjt=parent+'/items/:itemId/situational/:situationalAttemptId'
 router.get(sjt,childAccess('SITUATIONAL'),wrapped(async req=>{
  const runtime=await loadEmbeddedSituationalAttemptRuntime(req.params.situationalAttemptId,embedded(req))
  return projectTeacherSituationalRuntime(situationalAttemptForResponse(runtime.row,runtime.snapshot,{suppressResult:true,feedbackDeferred:true}) as unknown as Record<string,unknown>)
 }))
 router.get(sjt+'/assets/:assetId/content',childAccess('SITUATIONAL'),compositeController.embeddedSituationalAsset)
 router.get(sjt+'/scenes/:sceneKey/video-sources',childAccess('SITUATIONAL'),situationalVideoController.embeddedAuthenticated)
 router.post(sjt+'/submit',childAccess('SITUATIONAL'),finalConsent,wrapped(async req=>{
  const parsed=situationalFinalSubmitSchema.parse(req.body)
  const data=await submitSituationalAttemptFinal({attemptId:req.params.situationalAttemptId,userId:req.user!.userId,embedded:embedded(req),...parsed})
  return projectTeacherSituationalRuntime(data as unknown as Record<string,unknown>)
 }))
 return router
}
