import { Router } from 'express'
import { z,ZodError } from 'zod'
import { asyncHandler } from '../../middleware/asyncHandler'
import { authenticateHuiteacher } from '../../middleware/auth'
import { success } from '../../utils/response'
import { requireRecentTeacherMfa,requireTeacherProductAdmin } from './authority'
import { readTeacherFormGroupReport,HuiteacherGroupReportError } from './groupReport.service'

const router=Router()
router.use((_req,res,next)=>{res.setHeader('Cache-Control','no-store');next()})
const uuid=z.string().guid()
const base='/organizations/:organizationId/evaluation-events/:eventId/forms/:formId/group-report'
const handler=(publishV2:boolean,releasedOnly=false)=>asyncHandler(async(req,res)=>{
  try{
    const result=await readTeacherFormGroupReport({
      organizationId:uuid.parse(req.params.organizationId),
      eventId:uuid.parse(req.params.eventId),formId:uuid.parse(req.params.formId),
      actorUserId:req.user!.userId,publishV2,releasedOnly,
    })
    return success(res,result)
  }catch(e){
    if(e instanceof ZodError)return res.status(400).json({
      code:'HUITEACHER_REPORT_ARGUMENT_INVALID',message:'学校报告参数无效',data:null,
    })
    const known=e as {code?:string;statusCode?:number}
    if(e instanceof HuiteacherGroupReportError||(
      typeof known.statusCode==='number'&&known.statusCode>=400&&known.statusCode<600)){
      const code=known.code??'HUITEACHER_REPORT_DENIED'
      return res.status(known.statusCode??409).json({code,
        message:({
          HUITEACHER_GROUP_MINIMUM_N_NOT_MET:'有效参与人数不足，无法发布报告',
          HUITEACHER_GROUP_NOT_FROZEN:'必须先正式关闭评价活动和任务',
          HUITEACHER_GROUP_PENDING_FINALS:'仍有未完成作答，当前增强保护要求完整完成',
          HUITEACHER_GROUP_INCOMPLETE_COHORT:'当前评价不满足冻结总体或作答完整性要求',
          HUITEACHER_GROUP_POPULATION_DIFFERENCING_BLOCKED:'所选增强保护阻止不同群体的重复披露',
          HUITEACHER_GROUP_ATTRITION_COMPLEMENT_SMALL:'所选保护要求至少五名未完成者或全部完成',
          HUITEACHER_REPORT_AWAITING_RELEASE:'请由学校 Teacher 管理员先发布正式报告',
          HUITEACHER_REPORT_RELEASE_DELAY:'增强保护的延迟披露期限尚未结束',
          HUITEACHER_REPORT_CAPACITY_LIMIT:'样本规模超出当前受控分析上限',
        } as Record<string,string>)[code]??'报告来源、授权或保护策略条件不满足',
        data:null,
      })
    }
    throw e
  }
})
// The V2 released-only GET cannot create a disclosure or write a legacy
// ledger; current product admin authority and immutable digest remain required.
router.get(base+'/released',authenticateHuiteacher,
  requireTeacherProductAdmin,handler(false,true))
router.get(base,authenticateHuiteacher,
  requireTeacherProductAdmin,requireRecentTeacherMfa,handler(false))
router.post(base+'/release',authenticateHuiteacher,
  requireTeacherProductAdmin,requireRecentTeacherMfa,handler(true))
export default router
