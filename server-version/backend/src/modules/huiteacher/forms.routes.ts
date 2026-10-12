import { Router } from 'express'
import { z,ZodError } from 'zod'
import { asyncHandler } from '../../middleware/asyncHandler'
import { authenticateHuiteacher } from '../../middleware/auth'
import { success } from '../../utils/response'
import { requireRecentTeacherMfa,requireTeacherProductAdmin } from './authority'
import {
  createHuiteacherForm,listHuiteacherForms,readHuiteacherForm,
  updateHuiteacherForm,publishHuiteacherForm,previewHuiteacherForm,
  HuiteacherFormError,
} from './forms.service'
import { SurveyFinalValidationError } from '../survey/final.compute'

const router=Router()
router.use((_req,res,next)=>{res.setHeader('Cache-Control','no-store');next()})
const id=z.string().uuid()
const title=z.string().trim().min(1).max(200)
const create=z.object({title}).strict()
const update=z.object({
  expectedRevision:z.number().int().min(1),title,
  definition:z.record(z.unknown()),
}).strict()
const publish=z.object({expectedRevision:z.number().int().min(1)}).strict()
const preview=z.object({answers:z.record(z.unknown())}).strict()
const wrap=(fn:(req:any,res:any)=>Promise<unknown>)=>asyncHandler(async(req,res)=>{
  try{return await fn(req,res)}
  catch(e){
    if(e instanceof ZodError)return res.status(400).json({code:'HUITEACHER_FORM_INPUT_INVALID',message:'Form 参数格式不合法',data:null})
    if(e instanceof HuiteacherFormError)return res.status(e.statusCode).json({
      code:e.code,message:'Form 定义或状态不允许此操作',data:e.issues.length?{issues:e.issues}:null,
    })
    if(e instanceof SurveyFinalValidationError)return res.status(400).json({
      code:'HUITEACHER_FORM_ANSWER_INVALID',message:'预览作答不符合问卷定义',data:{path:e.path},
    })
    throw e
  }
})
router.get('/organizations/:organizationId/forms',
  authenticateHuiteacher,requireTeacherProductAdmin,
  wrap(async(req,res)=>{
    const organizationId=id.parse(req.params.organizationId)
    const query=z.object({cursor:id.optional()}).strict().parse(req.query)
    return success(res,await listHuiteacherForms({
      organizationId,actorUserId:req.user!.userId,cursor:query.cursor,
    }))
  }))
router.post('/organizations/:organizationId/forms',
  authenticateHuiteacher,requireTeacherProductAdmin,requireRecentTeacherMfa,
  wrap(async(req,res)=>success(res,await createHuiteacherForm({
    organizationId:id.parse(req.params.organizationId),
    actorUserId:req.user!.userId,...create.parse(req.body),
  }))))
router.get('/organizations/:organizationId/forms/:formId',
  authenticateHuiteacher,requireTeacherProductAdmin,
  wrap(async(req,res)=>success(res,await readHuiteacherForm({
    organizationId:id.parse(req.params.organizationId),
    actorUserId:req.user!.userId,formId:id.parse(req.params.formId),
  }))))
router.put('/organizations/:organizationId/forms/:formId',
  authenticateHuiteacher,requireTeacherProductAdmin,requireRecentTeacherMfa,
  wrap(async(req,res)=>success(res,await updateHuiteacherForm({
    organizationId:id.parse(req.params.organizationId),
    actorUserId:req.user!.userId,formId:id.parse(req.params.formId),
    ...update.parse(req.body),
  }))))
router.post('/organizations/:organizationId/forms/:formId/publish',
  authenticateHuiteacher,requireTeacherProductAdmin,requireRecentTeacherMfa,
  wrap(async(req,res)=>success(res,await publishHuiteacherForm({
    organizationId:id.parse(req.params.organizationId),
    actorUserId:req.user!.userId,formId:id.parse(req.params.formId),
    ...publish.parse(req.body),
  }))))
router.post('/organizations/:organizationId/forms/:formId/preview',
  authenticateHuiteacher,requireTeacherProductAdmin,
  wrap(async(req,res)=>success(res,await previewHuiteacherForm({
    organizationId:id.parse(req.params.organizationId),
    actorUserId:req.user!.userId,formId:id.parse(req.params.formId),
    ...preview.parse(req.body),
  }))))
export default router
