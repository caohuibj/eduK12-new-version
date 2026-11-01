import {catalogDiscoveryQueryFields} from '../scale/library/catalog-discovery'
import { RELATIONAL_RESOURCE_KINDS } from '../assessment-relational/types'
import {educationPrivateRunTrackInput} from '../education-tools/private-tool.run-contract'
import {listEducationAssessmentResources} from '../education-tools/assessment-resource.catalog'
import { Router } from 'express'
import { z,ZodError } from 'zod'
import { asyncHandler } from '../../middleware/asyncHandler'
import { authenticateHuiteacher } from '../../middleware/auth'
import { success } from '../../utils/response'
import { requireTeacherProductAdmin,requireRecentTeacherMfa } from './authority'
import {
  HuiteacherRunError,addTeacherRunTrack,addTeacherPrivateRunTrack,addTeacherPrivateFormRunTrack,addTeacherPrivateCompositionRunTrack,previewTeacherRun,publishTeacherRun,
  progressTeacherRun,closeTeacherRun,cancelTeacherRun,listTeacherAvailableScales,teacherTrackingOptions,createNextTeacherTrackingEvent,removeTeacherTrackingDraftSource,
} from './run.service'

const router=Router()
router.use((_req,res,next)=>{res.setHeader('Cache-Control','no-store');next()})
const uuid=z.string().guid()
const keys=z.object({organizationId:uuid,eventId:uuid}).strict()
const resource=z.object({
  family:z.enum(RELATIONAL_RESOURCE_KINDS),
  key:z.string().trim().min(1).max(200),
  version:z.string().trim().min(1).max(120),
}).strict()
const track=z.object({
  expectedVersion:z.number().int().min(1).max(Number.MAX_SAFE_INTEGER).optional(),
  expectedRunId:uuid.optional(),
  resource,
  subjectSelector:z.record(z.string(), z.unknown()).default({}),
  respondentSelector:z.record(z.string(), z.unknown()).default({}),
  requestedPolicy:z.object({
    targetPolicy:z.object({
      mode:z.enum(['SELF','HOMEROOM_TEACHER','ALL_CLASS_TEACHERS',
        'SELECTED_CLASS_TEACHERS','COURSE_TEACHER']),
      teacherMembershipIds:z.array(z.string()).optional(),
      courseId:z.string().optional(),
    }).strict().optional(),
    subjectRoles:z.array(z.string().min(1)).min(1),
    respondentRoles:z.array(z.string().min(1)).min(1),
    relationshipKinds:z.array(z.string().min(1)).min(1),
    perspectives:z.array(z.string().min(1)).min(1),
    analysisMode:z.string().min(1),
    visibilityPolicyKey:z.string().min(1),
    minimumRespondents:z.number().int().min(1).nullable(),
  }).strict(),
}).strict().superRefine((value,ctx)=>{
  if(value.resource.key.startsWith('education-assessment:')&&value.expectedVersion===undefined)
    ctx.addIssue({code:'custom',path:['expectedVersion'],message:'固定教育测评必须绑定当前任务版本'})
  if(value.resource.key.startsWith('education-assessment:')&&value.expectedRunId===undefined)
    ctx.addIssue({code:'custom',path:['expectedRunId'],message:'固定教育测评必须绑定当前任务批次'})
})
const version=z.object({expectedVersion:z.number().int().min(1)}).strict()
const wrap=(fn:(req:any,res:any)=>Promise<unknown>)=>asyncHandler(async(req,res)=>{
  try{return await fn(req,res)}
  catch(e){
    if(e instanceof ZodError)return res.status(400).json({
      code:'HUITEACHER_RUN_INPUT_INVALID',message:'任务配置参数不合法',data:null,
    })
    if(e instanceof HuiteacherRunError)return res.status(e.statusCode).json({
      code:e.code,message:'任务或其评价活动状态不可用',data:null,
    })
    const known=e as {code?:string;message?:string;statusCode?:number}
    if(known&&typeof known.statusCode==='number'&&known.statusCode>=400&&known.statusCode<500)
      return res.status(known.statusCode).json({code:known.code??'RUN_INVALID',
        message:'测评资源、版本或任务授权不满足发布条件',data:null})
    throw e
  }
})
const base='/organizations/:organizationId/evaluation-events/:eventId/run'
router.get(base+'/assessment-resources',authenticateHuiteacher,requireTeacherProductAdmin,
  wrap(async(req,res)=>{
    const scope=keys.parse(req.params)
    const query=z.object({runId:uuid,expectedVersion:z.coerce.number().int().min(1).max(Number.MAX_SAFE_INTEGER),cursor:uuid.optional(),...catalogDiscoveryQueryFields}).strict().parse(req.query)
    return success(res,await listEducationAssessmentResources({product:'TEACHER',...scope,workflowId:scope.eventId,...query,actor:req.user!}))
  }))
router.get(base+'/released-scales',authenticateHuiteacher,requireTeacherProductAdmin,
  wrap(async(req,res)=>success(res,await listTeacherAvailableScales({
    ...keys.parse(req.params),actorUserId:req.user!.userId,cursor:z.string().optional().parse(req.query.cursor),
  }))))
router.post(base+'/tracks',authenticateHuiteacher,requireTeacherProductAdmin,
  wrap(async(req,res)=>{
    const scope={...keys.parse(req.params),actorUserId:req.user!.userId}
    if(req.body&&['privateScale','privateForm','privateComposition'].some(key=>Object.prototype.hasOwnProperty.call(req.body,key))){
      const selected=educationPrivateRunTrackInput.parse(req.body)
      return success(res,await ('privateComposition' in selected?addTeacherPrivateCompositionRunTrack:'privateForm' in selected?addTeacherPrivateFormRunTrack:addTeacherPrivateRunTrack)(scope,selected))
    }
    return success(res,await addTeacherRunTrack({...scope,...track.parse(req.body)}))
  }))
router.post(base+'/preview',authenticateHuiteacher,requireTeacherProductAdmin,
  wrap(async(req,res)=>success(res,await previewTeacherRun({
    ...keys.parse(req.params),actorUserId:req.user!.userId,...version.parse(req.body),
  }))))
router.post(base+'/publish',authenticateHuiteacher,requireTeacherProductAdmin,
  wrap(async(req,res)=>success(res,await publishTeacherRun({
    ...keys.parse(req.params),actorUserId:req.user!.userId,...version.extend({tracking:z.unknown().optional()}).parse(req.body),
  }))))
router.get(base+'/tracking',authenticateHuiteacher,requireTeacherProductAdmin,wrap(async(req,res)=>success(res,await teacherTrackingOptions({...keys.parse(req.params),actorUserId:req.user!.userId}))))
router.delete(base+'/tracks/:trackId',authenticateHuiteacher,requireTeacherProductAdmin,wrap(async(req,res)=>success(res,await removeTeacherTrackingDraftSource({...keys.extend({trackId:uuid}).parse(req.params),actorUserId:req.user!.userId,...z.object({expectedVersion:z.number().int().positive()}).strict().parse(req.body)}))))
router.post(base+'/next-wave',authenticateHuiteacher,requireTeacherProductAdmin,wrap(async(req,res)=>success(res,await createNextTeacherTrackingEvent({...keys.parse(req.params),actorUserId:req.user!.userId,...z.object({requestId:uuid}).strict().parse(req.body)}))))
router.get(base+'/progress',authenticateHuiteacher,requireTeacherProductAdmin,
  wrap(async(req,res)=>success(res,await progressTeacherRun({
    ...keys.parse(req.params),actorUserId:req.user!.userId,
  }))))
router.post(base+'/close',authenticateHuiteacher,requireTeacherProductAdmin,
  wrap(async(req,res)=>success(res,await closeTeacherRun({
    ...keys.parse(req.params),actorUserId:req.user!.userId,
  }))))
router.post(base+'/cancel',authenticateHuiteacher,requireTeacherProductAdmin,requireRecentTeacherMfa,
  wrap(async(req,res)=>success(res,await cancelTeacherRun({
    ...keys.parse(req.params),actorUserId:req.user!.userId,
  }))))
export default router
