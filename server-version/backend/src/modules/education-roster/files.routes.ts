import {Router} from 'express'
import {z,ZodError} from 'zod'
import {authenticateSchool,authenticateHuiteacher} from '../../middleware/auth'
import {requireRecentSchoolMfa} from '../campus/mfa.middleware'
import {requireOrganizationGovernance} from '../organization/access'
import {requireTeacherProductAdmin,requireRecentTeacherMfa} from '../huiteacher/authority'
import {assertPersonnelGovernor} from '../campus/personnel.binding'
import {CampusAdmissionError} from '../campus/admission.error'
import {prisma} from '../../config/database'
import {asyncHandler} from '../../middleware/asyncHandler'
import {createRedisRateLimiter} from '../../middleware/redisRateLimit'
import {success} from '../../utils/response'
import {rosterKinds,createRosterWorkbook,readRosterWorkbook} from './workbook'
export function educationRosterFileRouter(entry:'SCHOOL'|'TEACHER'){
 const router=Router(),base='/organizations/:organizationId/roster-files'
 const identity=entry==='SCHOOL'?[authenticateSchool,requireOrganizationGovernance]:[authenticateHuiteacher,requireTeacherProductAdmin]
 const mfa=entry==='SCHOOL'?requireRecentSchoolMfa:requireRecentTeacherMfa
 const rate=createRedisRateLimiter({name:'education-roster-files',limit:40,windowSeconds:900})
 router.use(base,(_req,res,next)=>{res.setHeader('Cache-Control','no-store');next()})
 router.get(base+'/capabilities',...identity,asyncHandler(async(req,res)=>{
  let personnel=false
  try{await prisma.$transaction(tx=>assertPersonnelGovernor(tx,req.user!,req.params.organizationId));personnel=true}
  catch(error){if(!(error instanceof CampusAdmissionError&&error.statusCode===403))throw error}
  return success(res,{structure:true,personnel,batchImport:true})
 }))
 router.get(base+'/template',...identity,mfa,rate,asyncHandler(async(req,res)=>{
  const parsed=z.object({kind:z.enum(rosterKinds)}).strict().safeParse(req.query)
  if(!parsed.success)return res.status(400).json({code:'BAD_REQUEST',message:'请选择对应导入类型。',data:null})
  const bytes=await createRosterWorkbook(parsed.data.kind)
  res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  res.setHeader('Content-Disposition',`attachment; filename="education-${parsed.data.kind.toLowerCase()}.xlsx"`)
  return res.send(bytes)
 }))
 router.post(base+'/read',...identity,mfa,rate,asyncHandler(async(req,res)=>{
  try{
   const {content,mode}=z.object({mode:z.enum(['single','job']).default('single'),content:z.string().min(4).max(1333336).regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/)}).strict().parse(req.body)
   return success(res,await readRosterWorkbook(Buffer.from(content,'base64'),mode))
  }catch(error){
   if(error instanceof ZodError)return res.status(400).json({code:'BAD_REQUEST',message:'请上传符合当前大小限制的普通 .xlsx 文件。',data:null})
   return res.status(400).json({code:'ROSTER_FILE_INVALID',message:error instanceof Error?error.message:'文件无法读取。',data:null})
  }
 }))
 return router
}
