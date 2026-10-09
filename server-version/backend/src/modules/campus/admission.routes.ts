import { Router } from 'express'
import { z, ZodError } from 'zod'
import { authenticateSchool } from '../../middleware/auth'
import { requireRecentSchoolMfa } from './mfa.middleware'
import { registrationRateLimit, withRegistrationAdmission } from '../../middleware/registrationAdmission'
import { asyncHandler } from '../../middleware/asyncHandler'
import { success } from '../../utils/response'
import { hashPassword, isValidPassword, PASSWORD_MAX_LENGTH } from '../../utils/password'
import {
  CampusAdmissionError, replaceCampusRoster, issueCampusActivationCodes,
  registerCampusStudent, setCampusRegistrationWindow, readCampusClassSummary,
  approveCampusClass, readCampusStudentStatus,
  createCampusAdmissionIncident, resolveCampusAdmissionIncident,
  quarantineCampusStudent,
} from './admission.service'

const router=Router()
router.use((_req,res,next)=>{res.setHeader('Cache-Control','no-store');next()})
const ids=z.string().uuid()
const classParams=z.object({organizationId:ids,classUnitId:ids})
const register=z.object({
  organizationId:ids,classUnitId:ids,
  studentNumber:z.string().min(2).max(40),
  activationCode:z.string().min(24).max(64),
  username:z.string().trim().min(4).max(32),
  password:z.string().min(8).max(PASSWORD_MAX_LENGTH).refine(isValidPassword),
}).strict()

// All exposed errors use a uniform failure for eligibility/code mismatch;
// neither failed login nor failed registration reveals a student number.
const wrap=(fn:(req:any,res:any)=>Promise<any>)=>asyncHandler(async(req,res)=>{
  try { return await fn(req,res) }
  catch (e) {
    if (e instanceof ZodError)
      return res.status(400).json({code:'BAD_REQUEST',message:'请求内容格式不正确',data:null})
    if (e instanceof CampusAdmissionError)
      return res.status(e.statusCode).json({code:e.code,message:'校园操作暂不可用，请核实信息或联系学校',data:null})
    throw e
  }
})

router.post('/register',registrationRateLimit,withRegistrationAdmission(wrap(async(req,res)=>{
  const data=register.parse(req.body)
  const result=await registerCampusStudent(data)
  return success(res,result,'注册成功，请等待班级统一审批')
})))

router.get('/my-status',authenticateSchool,wrap(async(req,res)=>
  success(res,await readCampusStudentStatus(req.user!))
))

router.post('/organizations/:organizationId/classes/:classUnitId/roster',authenticateSchool,requireRecentSchoolMfa,wrap(async(req,res)=>{
  const params=classParams.parse(req.params)
  const input=z.object({studentNumbers:z.array(z.string()).min(1).max(5000)}).strict().parse(req.body)
  return success(res,await replaceCampusRoster({actor:req.user!,...params,studentNumbers:input.studentNumbers}))
}))

router.post('/organizations/:organizationId/classes/:classUnitId/codes',authenticateSchool,requireRecentSchoolMfa,wrap(async(req,res)=>{
  const params=classParams.parse(req.params)
  const data=z.object({count:z.number().int().min(1).max(500),ttlMinutes:z.number().int().min(5).max(10080)}).strict().parse(req.body)
  return success(res,await issueCampusActivationCodes({actor:req.user!,...params,...data}))
}))

router.post('/organizations/:organizationId/classes/:classUnitId/window',authenticateSchool,requireRecentSchoolMfa,wrap(async(req,res)=>{
  const params=classParams.parse(req.params)
  const body=z.object({action:z.enum(['OPEN','CLOSE']),closesAt:z.string().datetime().optional()}).strict().parse(req.body)
  return success(res,await setCampusRegistrationWindow({actor:req.user!,...params,action:body.action,closesAt:body.closesAt?new Date(body.closesAt):undefined}))
}))

router.get('/organizations/:organizationId/classes/:classUnitId/summary',authenticateSchool,requireRecentSchoolMfa,wrap(async(req,res)=>{
  const params=classParams.parse(req.params)
  return success(res,await readCampusClassSummary({actor:req.user!,...params}))
}))

router.post('/organizations/:organizationId/classes/:classUnitId/approve',authenticateSchool,requireRecentSchoolMfa,wrap(async(req,res)=>{
  const params=classParams.parse(req.params)
  const body=z.object({expectedRosterVersion:z.number().int().nonnegative()}).strict().parse(req.body)
  return success(res,await approveCampusClass({actor:req.user!,...params,...body}))
}))


router.post('/organizations/:organizationId/classes/:classUnitId/incidents',
  authenticateSchool,requireRecentSchoolMfa,wrap(async(req,res)=>{
    const params=classParams.parse(req.params)
    const body=z.object({
      reason:z.enum(['SUSPECTED_REGISTRATION_TAKEOVER','ELIGIBILITY_DISPUTE','OTHER_REGISTRATION_ERROR']),
    }).strict().parse(req.body)
    return success(res,await createCampusAdmissionIncident({actor:req.user!,...params,...body}))
  })
)

router.post('/organizations/:organizationId/classes/:classUnitId/incidents/:incidentId/resolve',
  authenticateSchool,requireRecentSchoolMfa,wrap(async(req,res)=>{
    const params=classParams.extend({incidentId:ids}).parse(req.params)
    const body=z.object({
      resolution:z.enum(['VERIFIED_CORRECT','STUDENT_QUARANTINED','ROSTER_CORRECTED']),
    }).strict().parse(req.body)
    return success(res,await resolveCampusAdmissionIncident({actor:req.user!,...params,...body}))
  })
)

router.post('/organizations/:organizationId/classes/:classUnitId/quarantine',
  authenticateSchool,requireRecentSchoolMfa,wrap(async(req,res)=>{
    const params=classParams.parse(req.params)
    const body=z.object({studentNumber:z.string().min(2).max(40)}).strict().parse(req.body)
    return success(res,await quarantineCampusStudent({actor:req.user!,...params,...body}))
  })
)

export default router
