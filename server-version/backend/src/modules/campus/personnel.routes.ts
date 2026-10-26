import {Router} from 'express'
import {z,ZodError} from 'zod'
import {authenticateSchool} from '../../middleware/auth'
import {requireRecentSchoolMfa} from './mfa.middleware'
import {asyncHandler} from '../../middleware/asyncHandler'
import {success} from '../../utils/response'
import {CampusAdmissionError} from './admission.error'
import {previewPersonnel,importPersonnel,listPersonnel,issuePersonnelCredential,bindExistingPersonnel,personnelInput} from './personnel.service'
import {directoryQuery,directoryEntryId,listPersonnelDirectory,readPersonnelDirectoryEntry} from './personnel.directory'
import {registerCampusStaff} from './staff.service'
import {createRedisRateLimiter} from '../../middleware/redisRateLimit'
const router=Router(),uuid=z.string().guid()
router.use((_req,res,next)=>{res.setHeader('Cache-Control','no-store');next()})
const rate=createRedisRateLimiter({name:'campus-personnel',limit:40,windowSeconds:900})
const handle=(fn:(req:any,res:any)=>Promise<any>)=>asyncHandler(async(req,res)=>{
 try{return await fn(req,res)}catch(error){
  if(error instanceof ZodError)return res.status(400).json({code:'BAD_REQUEST',message:'名单格式不正确，请检查模板及每批最多 100 行的限制。',data:null})
  if(error instanceof CampusAdmissionError)return res.status(error.statusCode).json({code:error.code,message:({PERSONNEL_PREVIEW_CHANGED:'预览已过期或存在冲突，请重新预览。',PERSONNEL_OFFLINE_VERIFICATION_REQUIRED:'请先核实已有账号确实属于本人。',PERSONNEL_ALREADY_ACTIVATED:'该人员已激活，请使用现有账号。',PERSONNEL_BATCH_CONFLICT:'该批次编号已使用，请重新预览。',PERSONNEL_ADDITIVE_IMPORT_REQUIRED:'该班级已有导入名单，请使用只新增的名单导入。'} as Record<string,string>)[error.code]??'人员操作暂不可用，请核实学校授权、注册窗口和激活信息。',data:null})
  if((error as any)?.code==='P2034'||['23505','40001'].includes((error as any)?.meta?.code))return res.status(409).json({code:'PERSONNEL_CONCURRENT_CHANGE',message:'名单或权限同时发生变化，请重新预览后确认。',data:null})
  throw error
 }
})
const base='/organizations/:organizationId/personnel'
router.get(base+'/directory',authenticateSchool,requireRecentSchoolMfa,handle(async(req,res)=>success(res,await listPersonnelDirectory({actor:req.user,organizationId:uuid.parse(req.params.organizationId),query:directoryQuery.parse(req.query)}))))
router.get(base+'/directory/:entryId',authenticateSchool,requireRecentSchoolMfa,handle(async(req,res)=>success(res,await readPersonnelDirectoryEntry({actor:req.user,organizationId:uuid.parse(req.params.organizationId),entryId:directoryEntryId.parse(req.params.entryId)}))))
router.get(base,authenticateSchool,requireRecentSchoolMfa,handle(async(req,res)=>success(res,await listPersonnel({actor:req.user,organizationId:uuid.parse(req.params.organizationId),after:z.string().guid().optional().parse(req.query.after)}))))
router.post(base+'/preview',authenticateSchool,requireRecentSchoolMfa,rate,handle(async(req,res)=>success(res,await previewPersonnel({actor:req.user,organizationId:uuid.parse(req.params.organizationId),input:personnelInput.parse(req.body)}))))
router.post(base+'/import',authenticateSchool,requireRecentSchoolMfa,rate,handle(async(req,res)=>{
 const body=z.object({input:personnelInput,batchId:uuid,previewToken:z.string().regex(/^[a-f0-9]{64}$/),verifiedOffline:z.boolean().default(false)}).strict().parse(req.body)
 return success(res,await importPersonnel({actor:req.user,organizationId:uuid.parse(req.params.organizationId),...body}))
}))
router.post(base+'/:personId/credential',authenticateSchool,requireRecentSchoolMfa,rate,handle(async(req,res)=>{
 z.object({}).strict().parse(req.body)
 return success(res,await issuePersonnelCredential({actor:req.user,organizationId:uuid.parse(req.params.organizationId),personId:uuid.parse(req.params.personId)}))
}))
router.post(base+'/:personId/bind-existing',authenticateSchool,requireRecentSchoolMfa,rate,handle(async(req,res)=>{
 const body=z.object({username:z.string().trim().min(4).max(32),verifiedOffline:z.literal(true)}).strict().parse(req.body)
 return success(res,await bindExistingPersonnel({actor:req.user,organizationId:uuid.parse(req.params.organizationId),personId:uuid.parse(req.params.personId),...body}))
}))
router.post('/personnel/claim-staff',authenticateSchool,rate,handle(async(req,res)=>{
 const {inviteCode}=z.object({inviteCode:z.string().min(28).max(64)}).strict().parse(req.body)
 return success(res,await registerCampusStaff({inviteCode,username:'',password:'',actorUserId:req.user.userId}),'已由本人确认，继续使用原校园账号')
}))
export default router
