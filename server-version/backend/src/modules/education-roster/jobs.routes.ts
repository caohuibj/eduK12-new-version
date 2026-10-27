import {Router} from 'express'
import {z,ZodError} from 'zod'
import {authenticateSchool,authenticateHuiteacher} from '../../middleware/auth'
import {requireOrganizationGovernance} from '../organization/access'
import {requireRecentSchoolMfa} from '../campus/mfa.middleware'
import {requireTeacherProductAdmin,requireRecentTeacherMfa} from '../huiteacher/authority'
import {OrganizationDomainError} from '../organization/types'
import {CampusAdmissionError} from '../campus/admission.error'
import {asyncHandler} from '../../middleware/asyncHandler'
import {createRedisRateLimiter} from '../../middleware/redisRateLimit'
import {success} from '../../utils/response'
import {rosterJobInput,rosterSource,RosterJobError,type RosterEntry} from './jobs.schema'
import {createRosterJob,readRosterJob,listRosterJobs,matchRosterJob,previewRosterPart,beginRosterRun,pauseRosterJob,commitRosterPart} from './jobs.service'
const id=z.string().guid(),proof=z.string().regex(/^[a-f0-9]{64}$/),input=rosterJobInput
const part=z.coerce.number().int().min(0).max(49)
export function educationRosterJobRouter(entry:RosterEntry){
 const router=Router(),base='/organizations/:organizationId/roster-imports'
 router.use(base,(_req,res,next)=>{res.setHeader('Cache-Control','no-store');next()})
 const guards=entry==='SCHOOL'?[authenticateSchool,requireOrganizationGovernance,requireRecentSchoolMfa]:[authenticateHuiteacher,requireTeacherProductAdmin,requireRecentTeacherMfa]
 // Reads/previews are bounded separately; every business commit consumes the unchanged legacy write budget.
 const metadata=createRedisRateLimiter({name:'education-roster-job-metadata',limit:120,windowSeconds:900})
 const preview=createRedisRateLimiter({name:'education-roster-job-preview',limit:80,windowSeconds:900})
 const write=createRedisRateLimiter({name:'campus-personnel',limit:40,windowSeconds:900})
 const handle=(fn:(req:any,res:any,s:any)=>Promise<any>)=>asyncHandler(async(req,res)=>{
  try{return await fn(req,res,{actor:req.user!,organizationId:id.parse(req.params.organizationId),entry})}
  catch(error){
   if(error instanceof ZodError)return res.status(400).json({code:'ROSTER_INPUT_INVALID',message:'名单格式不正确：整份最多5000行，每批最多100行，请核对模板。',data:null})
   if(error instanceof RosterJobError)return res.status(error.statusCode).json({code:error.code,message:error.message,data:{issues:error.issues}})
   if(error instanceof OrganizationDomainError)return res.status(error.statusCode).json({code:error.code,message:error.message,data:null})
   if(error instanceof CampusAdmissionError)return res.status(error.statusCode).json({code:error.code,message:error.code==='PERSONNEL_PREVIEW_CHANGED'?'名单或班级状态已变化，请重新核对剩余内容。':'人员操作未取得当前授权或不符合原有激活、班级规则。',data:null})
   if((error as any)?.code==='P2034'||['23505','40001','40P01'].includes((error as any)?.meta?.code))return res.status(409).json({code:'ROSTER_CONCURRENT_CHANGE',message:'名单或权限同时发生变化。请先核对服务器进度，再明确继续。',data:null})
   throw error
  }
 })
 router.get(base,...guards,handle(async(req,res,s)=>{const q=z.object({before:id.optional()}).strict().parse(req.query);return success(res,await listRosterJobs(s,q.before))}))
 router.post(base,...guards,metadata,handle(async(req,res,s)=>{const body=z.object({requestId:id,input,source:rosterSource}).strict().parse(req.body);return success(res,await createRosterJob(s,body))}))
 router.get(base+'/:jobId',...guards,handle(async(req,res,s)=>success(res,await readRosterJob(s,id.parse(req.params.jobId)))))
 router.post(base+'/:jobId/match',...guards,metadata,handle(async(req,res,s)=>{const body=z.object({input,source:rosterSource}).strict().parse(req.body);return success(res,await matchRosterJob(s,id.parse(req.params.jobId),body))}))
 router.post(base+'/:jobId/parts/:part/preview',...guards,preview,handle(async(req,res,s)=>{const body=z.object({proof,input}).strict().parse(req.body);return success(res,await previewRosterPart(s,id.parse(req.params.jobId),part.parse(req.params.part),body))}))
 for(const operation of ['confirm','resume'] as const)router.post(base+'/:jobId/'+operation,...guards,metadata,handle(async(req,res,s)=>{
  const body=z.object({proof,planToken:proof,verifiedOffline:z.boolean().optional()}).strict().parse(req.body)
  return success(res,await beginRosterRun(s,id.parse(req.params.jobId),body,operation==='resume'))
 }))
 for(const operation of ['pause','recheck'] as const)router.post(base+'/:jobId/'+operation,...guards,metadata,handle(async(req,res,s)=>{
  const body=z.object({proof}).strict().parse(req.body);return success(res,await pauseRosterJob(s,id.parse(req.params.jobId),body.proof,operation==='recheck'))
 }))
 router.post(base+'/:jobId/parts/:part/commit',...guards,write,handle(async(req,res,s)=>{
  const body=z.object({proof,runToken:z.string().regex(/^[A-Za-z0-9_-]{32,64}$/),input}).strict().parse(req.body)
  return success(res,await commitRosterPart(s,id.parse(req.params.jobId),part.parse(req.params.part),body))
 }))
 return router
}
