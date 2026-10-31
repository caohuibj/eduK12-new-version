import {Router,type Response} from 'express'
import {z,ZodError} from 'zod'
import {authenticateHuiteacher} from '../../middleware/auth'
import {asyncHandler} from '../../middleware/asyncHandler'
import {success} from '../../utils/response'
import {startInvitedFieldComposition,readInvitedFieldComposition} from './fieldComposition.service'
import {FieldCompositionError,currentFieldComposition} from './fieldComposition.authority'
import {prisma} from '../../config/database'
import {getAttemptState} from '../composite/composite.service'
import {projectTeacherCompositeRuntime} from './assessmentRuntime.routes'
import {compositeController} from '../composite/composite.controller'
import {compositeImageController} from '../composite/composite-image.controller'
import {compositeVideoController} from '../composite/composite-video.controller'

const router=Router(),uuid=z.string().guid()
router.use((_req,res,next)=>{res.setHeader('Cache-Control','no-store');next()})
router.use(authenticateHuiteacher,(req,res,next)=>{
 if(req.user?.accountDomain!=='SCHOOL'||!['TEACHER','ADMIN'].includes(req.user.role))
  return res.status(404).json({code:'HUITEACHER_FIELD_UNAVAILABLE',message:'观察任务不可访问',data:null})
 next()
})
function failure(error:unknown,res:Response){
  if(error instanceof ZodError)return res.status(400).json({code:'HUITEACHER_FIELD_ARGUMENT',message:'观察任务参数无效',data:null})
  if(error instanceof FieldCompositionError)return res.status(error.statusCode).json({code:error.code,message:'邀请、观察目标、固定问卷或当前任务资格已变化',data:null})
  const known=error as {statusCode?:number;code?:string}
  if(typeof known?.statusCode==='number'&&known.statusCode>=400&&known.statusCode<500)
   return res.status(known.statusCode).json({code:known.code??'HUITEACHER_FIELD_UNAVAILABLE',message:'观察任务当前不可访问或提交',data:null})
  throw error
}
const wrap=(task:(req:any)=>Promise<unknown>)=>asyncHandler(async(req,res)=>{
 try{return success(res,await task(req))}catch(error){return failure(error,res)}
})
router.get('/invitations/:invitationId',wrap(req=>readInvitedFieldComposition({invitationId:uuid.parse(req.params.invitationId),actorUserId:req.user!.userId})))
router.post('/invitations/:invitationId/start',wrap(req=>{
 z.object({}).strict().parse(req.body)
 return startInvitedFieldComposition({invitationId:uuid.parse(req.params.invitationId),actorUserId:req.user!.userId})
}))
const parent='/assessment-composite-attempts/:attemptId'
router.use(parent,(req,res,next)=>{
 void Promise.resolve().then(()=>currentFieldComposition(prisma,{attemptId:uuid.parse(req.params.attemptId),actorUserId:req.user!.userId}))
  .then(()=>next()).catch(error=>{try{failure(error,res)}catch(unexpected){next(unexpected)}})
})
// The shared native reader validates current field authority before delivery.
// Native admission repeats that fence before replay, and FINAL holds the grant
// and event in the same transaction as the canonical child write.
router.get(parent,wrap(async req=>projectTeacherCompositeRuntime(await getAttemptState(uuid.parse(req.params.attemptId),{userId:req.user!.userId},undefined,'current-unit'))))
router.get(parent+'/form-sections/:sectionId/assets/:assetId/content',compositeImageController.authenticatedFormImage)
router.post(parent+'/form-sections/:sectionId/items/:itemId/options/:optionIndex/video-capability',compositeVideoController.authenticatedFormVideo)
router.post(parent+'/form-sections/:sectionId/submit',compositeController.submitFinalFormSection)
router.get(parent+'/items/:itemId/scale/assets/:assetId/content',compositeImageController.authenticatedScaleImage)
router.post(parent+'/items/:itemId/scale/items/:itemCode/video-capability',compositeVideoController.authenticatedScaleVideo)
router.post(parent+'/items/:itemId/scale/submit',asyncHandler(async(req,res)=>{
 req.query.response='receipt'
 await compositeController.submitFinalScale(req,res)
}))
export default router
