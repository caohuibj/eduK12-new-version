import { Router } from 'express'
import { z,ZodError } from 'zod'
import { asyncHandler } from '../../middleware/asyncHandler'
import { authenticateHuiteacher } from '../../middleware/auth'
import { success } from '../../utils/response'
import { requireRecentTeacherMfa,requireTeacherProductAdmin } from './authority'
import { readTeacherFormGroupReport,HuiteacherGroupReportError } from './groupReport.service'
const router=Router()
router.use((_req,res,next)=>{res.setHeader('Cache-Control','no-store');next()})
const uuid=z.string().uuid()
router.get('/organizations/:organizationId/evaluation-events/:eventId/forms/:formId/group-report',
  authenticateHuiteacher,requireTeacherProductAdmin,requireRecentTeacherMfa,
  asyncHandler(async(req,res)=>{
    try{
      const result=await readTeacherFormGroupReport({
        organizationId:uuid.parse(req.params.organizationId),
        eventId:uuid.parse(req.params.eventId),formId:uuid.parse(req.params.formId),
        actorUserId:req.user!.userId,
      })
      return success(res,result)
    }catch(e){
      if(e instanceof ZodError)return res.status(400).json({
        code:'HUITEACHER_REPORT_ARGUMENT_INVALID',message:'学校报告参数无效',data:null,
      })
      if(e instanceof HuiteacherGroupReportError)return res.status(e.statusCode).json({
        code:e.code,message:({
          HUITEACHER_GROUP_MINIMUM_N_NOT_MET:'有效参与人数不足，不能披露学校群体报告',
          HUITEACHER_GROUP_NOT_FROZEN:'评价活动和任务均关闭后才能查看固定样本报告',
          HUITEACHER_GROUP_PENDING_FINALS:'仍有未完成作答，不能建立稳定的群体报告',
          HUITEACHER_GROUP_INCOMPLETE_COHORT:'当前群体未全部完成评价，无法披露可推断个体的统计结果',
          HUITEACHER_GROUP_POPULATION_DIFFERENCING_BLOCKED:'本工具已发布过不同成员构成的报告；为避免跨轮差分识别，本次群体统计被抑制',
          HUITEACHER_GROUP_CAPACITY_LIMIT:'样本规模超出当前受控分析上限',
        } as Record<string,string>)[e.code]||'报告来源、授权或隐私条件不满足',
        data:null,
      })
      throw e
    }
  }))
export default router
