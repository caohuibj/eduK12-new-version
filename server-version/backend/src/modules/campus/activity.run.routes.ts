import { Router } from 'express'
import { z, ZodError } from 'zod'
import { authenticateSchool } from '../../middleware/auth'
import { requireRecentSchoolMfa } from './mfa.middleware'
import { asyncHandler } from '../../middleware/asyncHandler'
import { success, forbidden, notFound } from '../../utils/response'
import { assessmentRunController } from '../assessment-run/run.controller'
import { CampusActivityError,assertCampusActivityEditor } from './activity.service'
import {
  assertCampusActivityRunEditor,assertCampusActivityRunGovernor,
  createCampusActivityRunDraft,bindCampusActivityRun,
} from './activity.runs'
import { prisma } from '../../config/database'

const router=Router()
router.use((_req,res,next)=>{res.setHeader('Cache-Control','no-store');next()})
const uuid=z.string().uuid()
const path=z.object({organizationId:uuid,courseId:uuid})
const runPath=path.extend({runId:uuid})
const execPath=runPath.extend({executionId:uuid})
const wrap=(fn:(req:any,res:any)=>Promise<any>)=>asyncHandler(async(req,res)=>{
  try{return await fn(req,res)}
  catch(err){
    if(err instanceof CampusActivityError)return res.status(err.statusCode).json({
      code:err.code,message:'测评尚未获得学校活动授权',data:null,
    })
    if(err instanceof ZodError)return res.status(400).json({
      code:'CAMPUS_RUN_INPUT_INVALID',message:'测评请求格式不正确',data:null,
    })
    throw err
  }
})

router.get('/organizations/:organizationId/activities/:courseId/run-resources',
  authenticateSchool,wrap(async(req,res)=>{
    await assertCampusActivityEditor({actor:req.user!,...path.parse(req.params)})
    return assessmentRunController.resources(req,res)
  })
)

router.post('/organizations/:organizationId/activities/:courseId/runs',
  authenticateSchool,wrap(async(req,res)=>{
    const data=z.object({
      name:z.string().trim().min(1).max(200),
      intakeDeadline:z.string().datetime().nullable().optional(),
    }).strict().parse(req.body)
    return success(res,await createCampusActivityRunDraft({
      actor:req.user!,...path.parse(req.params),
      name:data.name,intakeDeadline:data.intakeDeadline?new Date(data.intakeDeadline):null,
    }))
  })
)
router.post('/organizations/:organizationId/activities/:courseId/runs/bind',
  authenticateSchool,wrap(async(req,res)=>{
    const data=z.object({runId:uuid}).strict().parse(req.body)
    return success(res,await bindCampusActivityRun({
      actor:req.user!,...path.parse(req.params),runId:data.runId,
    }))
  })
)

router.get('/organizations/:organizationId/activities/:courseId/runs/:runId',
  authenticateSchool,wrap(async(req,res)=>{
    await assertCampusActivityRunEditor({actor:req.user!,...runPath.parse(req.params)})
    return assessmentRunController.detail(req,res)
  })
)
router.post('/organizations/:organizationId/activities/:courseId/runs/:runId/tracks',
  authenticateSchool,wrap(async(req,res)=>{
    const result=await assertCampusActivityRunEditor({
      actor:req.user!,...runPath.parse(req.params),
    })
    if(result.activity.status!=='DRAFT')return forbidden(res,'活动提交审核后不能再修改测评内容')
    return assessmentRunController.addTrack(req,res)
  })
)
router.post('/organizations/:organizationId/activities/:courseId/runs/:runId/preview',
  authenticateSchool,wrap(async(req,res)=>{
    const result=await assertCampusActivityRunEditor({actor:req.user!,...runPath.parse(req.params)})
    if(!['DRAFT','SUBMITTED','OPEN'].includes(result.activity.status))
      return forbidden(res,'活动不可预览')
    return assessmentRunController.preview(req,res)
  })
)
router.post('/organizations/:organizationId/activities/:courseId/runs/:runId/publish',
  authenticateSchool,requireRecentSchoolMfa,wrap(async(req,res)=>{
    const result=await assertCampusActivityRunGovernor({actor:req.user!,...runPath.parse(req.params)})
    if(result.activity.status!=='OPEN')return forbidden(res,'须由学校管理员正式开放活动后再发布测评')
    return assessmentRunController.publish(req,res)
  })
)
router.get('/organizations/:organizationId/activities/:courseId/runs/:runId/progress',
  authenticateSchool,wrap(async(req,res)=>{
    await assertCampusActivityRunEditor({actor:req.user!,...runPath.parse(req.params)})
    return assessmentRunController.progress(req,res)
  })
)
router.post('/organizations/:organizationId/activities/:courseId/runs/:runId/close',
  authenticateSchool,requireRecentSchoolMfa,wrap(async(req,res)=>{
    await assertCampusActivityRunGovernor({actor:req.user!,...runPath.parse(req.params)})
    return assessmentRunController.close(req,res)
  })
)
router.post('/organizations/:organizationId/activities/:courseId/runs/:runId/cancel',
  authenticateSchool,requireRecentSchoolMfa,wrap(async(req,res)=>{
    await assertCampusActivityRunGovernor({actor:req.user!,...runPath.parse(req.params)})
    return assessmentRunController.cancel(req,res)
  })
)

async function currentSchoolExecution(req:import('express').Request,res:import('express').Response,
  next:import('express').NextFunction){
  try{
    if(req.user?.accountDomain!=='SCHOOL')return forbidden(res,'校园账号权限不匹配')
    const p=execPath.safeParse(req.params)
    if(!p.success)return notFound(res,'测评任务不存在')
    // Parent and student respondents must both authenticate as SCHOOL; the
    // canonical Run start path then checks exact frozen respondent + consent
    // and live Activity, class and relationship population within its txn.
    const rows=await prisma.$queryRaw<Array<{allowed:boolean}>>`
      SELECT EXISTS(
        SELECT 1 FROM "campus_activity_runs" ar
        JOIN "campus_activities" a ON a."course_id"=ar."course_id"
          AND a."organization_id"=ar."organization_id" AND a."status"='OPEN'
        JOIN "assessment_run_executions" e ON e."run_id"=ar."run_id"
          AND e."organization_id"=ar."organization_id"
        JOIN "assessment_run_actor_snapshots" respondent
          ON respondent."id"=e."respondent_actor_snapshot_id"
          AND respondent."run_id"=e."run_id"
        WHERE ar."organization_id"=${p.data.organizationId}
          AND ar."course_id"=${p.data.courseId}
          AND ar."run_id"=${p.data.runId}
          AND e."id"=${p.data.executionId}
          AND respondent."user_id"=${req.user.userId}
      ) AS "allowed"
    `
    if(!rows[0]?.allowed)return notFound(res,'测评任务不可访问')
    next()
  }catch(err){next(err)}
}
router.post('/organizations/:organizationId/activities/:courseId/runs/:runId/executions/:executionId/consent/accept',
  authenticateSchool,currentSchoolExecution,wrap(async(req,res)=>
    assessmentRunController.acceptConsent(req,res)))
router.post('/organizations/:organizationId/activities/:courseId/runs/:runId/executions/:executionId/start',
  authenticateSchool,currentSchoolExecution,wrap(async(req,res)=>
    assessmentRunController.startExecution(req,res)))

export default router
