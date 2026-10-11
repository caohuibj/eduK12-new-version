import { Router } from 'express'
import { z,ZodError } from 'zod'
import { asyncHandler } from '../../middleware/asyncHandler'
import { authenticateHuiteacher } from '../../middleware/auth'
import { registrationRateLimit,withRegistrationAdmission } from '../../middleware/registrationAdmission'
import { success } from '../../utils/response'
import { isValidPassword,PASSWORD_MAX_LENGTH } from '../../utils/password'
import {
  CampusAdmissionError,replaceCampusRoster,issueCampusActivationCodes,
  setCampusRegistrationWindow,readCampusClassSummary,registerCampusStudent,
  approveCampusClass,
} from '../campus/admission.service'
import { requireTeacherProductAdmin,requireRecentTeacherMfa } from './authority'

const router=Router()
router.use((_req,res,next)=>{res.setHeader('Cache-Control','no-store');next()})
const id=z.string().uuid()
const ids=z.object({organizationId:id,classUnitId:id})
const registration=z.object({
  organizationId:id,classUnitId:id,
  studentNumber:z.string().min(2).max(40),
  activationCode:z.string().min(24).max(64),
  username:z.string().trim().min(4).max(32),
  password:z.string().min(8).max(PASSWORD_MAX_LENGTH).refine(isValidPassword),
}).strict()
const wrap=(fn:(req:any,res:any)=>Promise<any>)=>asyncHandler(async(req,res)=>{
  try{return await fn(req,res)}
  catch(e){
    if(e instanceof ZodError)return res.status(400).json({code:'BAD_REQUEST',message:'注册或管理参数不合法',data:null})
    if(e instanceof CampusAdmissionError)return res.status(e.statusCode).json({
      code:e.code,message:'学校成员准入暂不可用，请联系学校核实',data:null,
    })
    throw e
  }
})
// Reuses exactly the same education User and campus class-admission records,
// but not the HUISCHOOL psychology entitlement or School's counselor approval.
router.post('/education/register-student',registrationRateLimit,withRegistrationAdmission(wrap(async(req,res)=>{
  const data=registration.parse(req.body)
  const result=await registerCampusStudent({...data,product:'HUITEACHER'})
  return success(res,result,'教育账号注册成功，请等待学校完成班级审批')
})))
router.get('/organizations/:organizationId/classes/:classUnitId/summary',
  authenticateHuiteacher,requireTeacherProductAdmin,requireRecentTeacherMfa,
  wrap(async(req,res)=>success(res,await readCampusClassSummary({
    actor:req.user!,...ids.parse(req.params),product:'HUITEACHER',
  }))))
router.post('/organizations/:organizationId/classes/:classUnitId/roster',
  authenticateHuiteacher,requireTeacherProductAdmin,requireRecentTeacherMfa,
  wrap(async(req,res)=>{
    const body=z.object({studentNumbers:z.array(z.string()).min(1).max(5000)}).strict().parse(req.body)
    return success(res,await replaceCampusRoster({
      actor:req.user!,...ids.parse(req.params),studentNumbers:body.studentNumbers,
      product:'HUITEACHER',
    }))
  }))
router.post('/organizations/:organizationId/classes/:classUnitId/codes',
  authenticateHuiteacher,requireTeacherProductAdmin,requireRecentTeacherMfa,
  wrap(async(req,res)=>{
    const body=z.object({count:z.number().int().min(1).max(500),ttlMinutes:z.number().int().min(5).max(10080)}).strict().parse(req.body)
    return success(res,await issueCampusActivationCodes({
      actor:req.user!,...ids.parse(req.params),...body,product:'HUITEACHER',
    }))
  }))
router.post('/organizations/:organizationId/classes/:classUnitId/window',
  authenticateHuiteacher,requireTeacherProductAdmin,requireRecentTeacherMfa,
  wrap(async(req,res)=>{
    const body=z.object({action:z.enum(['OPEN','CLOSE']),closesAt:z.string().datetime().optional()}).strict().parse(req.body)
    return success(res,await setCampusRegistrationWindow({
      actor:req.user!,...ids.parse(req.params),
      action:body.action,closesAt:body.closesAt?new Date(body.closesAt):undefined,
      product:'HUITEACHER',
    }))
  }))
router.post('/organizations/:organizationId/classes/:classUnitId/approve',
  authenticateHuiteacher,requireTeacherProductAdmin,requireRecentTeacherMfa,
  wrap(async(req,res)=>{
    const body=z.object({expectedRosterVersion:z.number().int().min(0)}).strict().parse(req.body)
    return success(res,await approveCampusClass({
      actor:req.user!,...ids.parse(req.params),...body,product:'HUITEACHER',
    }))
  }))
export default router
