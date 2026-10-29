import { Router, type Request, type Response, type NextFunction } from 'express'
import { z } from 'zod'
import { prisma } from '../../config/database'
import { authenticate } from '../../middleware/auth'
import { createRedisRateLimiter } from '../../middleware/redisRateLimit'
import { withLoginPasswordVerification } from '../../middleware/loginRateLimit'
import { comparePassword } from '../../utils/password'
import { forbidden, error, success } from '../../utils/response'
import { assertEntryAdmin,AdminPermissionError } from '../admin-permissions/service'
import {ContentReleaseError} from '../measurement-content/release'
import {ContentAuthorityError} from '../measurement-content/content-authority'
import {EducationAssessmentSourceError} from '../education-tools/assessment-resource.repository'
import {educationStandardManagementCatalog,educationStandardManagementPreview,educationStandardManagementRecipients,
 educationStandardManagementGrants,educationStandardManagementOperation} from '../assessment-authorization/education-standard-management'
import {grantEducationStandardConfigurationUse,educationStandardUseInput} from '../assessment-authorization/education-standard-use'
import {revokeEducationStandardConfigurationUse,educationStandardRevokeInput} from '../assessment-authorization/education-standard-revoke'
import { requireRecentAdminKey } from '../admin-permissions/guards'
import type { EducationProduct } from '../organization/educationProductAccess'
import { changeTeacherScaleLicense,TeacherScaleLicenseError } from './scaleLicense.service'
import { changeTeacherPersonalGrant,TeacherPersonalGrantError } from './personalScaleGrant.service'
import {
  EducationProductGovernanceError, setEducationProductEntitlement,
  readEducationProductEntitlements,listEducationTeacherAdmins, grantEducationProductAdmin, revokeEducationProductAdmin,
} from '../organization/educationProductGovernance'

const router=Router()
const uuid=z.string().guid()
const product=z.enum(['HUISCHOOL','HUITEACHER'])
const limiter=createRedisRateLimiter({
  name:'education-platform-governance',limit:15,windowSeconds:900,
  key:req=>req.user?.userId||req.ip||'unknown',
})
const password=z.string().min(1).max(128)
const entitlementInput=z.object({
  action:z.enum(['ACTIVATE','SUSPEND']),expectedRevision:z.number().int().min(0).optional(),
  initialSchoolAdminMembershipId:z.string().guid().optional(),
  currentPassword:password,
}).strict()
const grantInput=z.object({membershipId:uuid,currentPassword:password}).strict()
const revokeInput=z.object({currentPassword:password}).strict()

// Platform operator lives in Training realm; neither School nor Teacher
// authenticated sessions may call these product-granting endpoints.
function platformEducationOrigin(req:Request,res:Response,next:NextFunction){
  const origin=req.get('Origin')
  if(origin){
    try{
      const url=new URL(origin)
      const allowed=url.origin==='https://eduk12.top'
        ||url.origin==='https://training.eduk12.top'
      const local=process.env.NODE_ENV!=='production'
        && ['localhost','127.0.0.1'].includes(url.hostname)
        && ['http:','https:'].includes(url.protocol)
      if(!allowed&&!local)return forbidden(res,'产品治理必须通过受信任的管理入口')
    }catch{return forbidden(res,'产品治理必须通过受信任的管理入口')}
  }else if(process.env.NODE_ENV==='production'&&!['GET','HEAD','OPTIONS'].includes(req.method)){
    return forbidden(res,'产品治理请求缺少合法来源')
  }
  next()
}
async function adminStepUp(req:Request,currentPassword:string){
  const user=await prisma.user.findUnique({where:{id:req.user!.userId}})
  if(!user||!['LEGACY','TRAINING'].includes(user.accountDomain)
    ||!user.isActive||user.isFrozen
    ||user.mustChangePassword||(user.expiresAt&&user.expiresAt<=new Date()))
    throw new EducationProductGovernanceError('PLATFORM_ADMIN_REQUIRED','无产品授权管理权限',403)
  const verified=await withLoginPasswordVerification(()=>comparePassword(currentPassword,user.passwordHash))
  if(!verified)throw new EducationProductGovernanceError('ADMIN_STEP_UP_REQUIRED','需要验证当前管理员密码',403)
  const entry=req.params.product==='HUISCHOOL'?'HUISCHOOL':'HUITEACHER'
  await assertEntryAdmin(prisma,req.user!.userId,entry)
}
const handle=(work:(req:Request)=>Promise<unknown>)=>async(req:Request,res:Response,next:NextFunction)=>{
  try{return success(res,await work(req))}
  catch(e){
    if(e instanceof z.ZodError)return error(res,'请求格式不合法',-1,400)
    if(e instanceof EducationProductGovernanceError)return error(res,e.message,-1,e.statusCode)
    if(e instanceof AdminPermissionError)return error(res,e.message,-1,e.statusCode)
    if(e instanceof ContentReleaseError)return error(res,e.code,-1,409)
    if(e instanceof ContentAuthorityError)return error(res,e.code,-1,403)
    if(e instanceof EducationAssessmentSourceError)return error(res,e.code,-1,e.statusCode)
    if(e instanceof TeacherScaleLicenseError)return error(res,'教师量表资源或学校授权条件不满足',-1,e.statusCode)
    if(e instanceof TeacherPersonalGrantError)return error(res,'个人量表授权条件不满足',-1,e.statusCode)
    next(e)
  }
}
router.use(authenticate,platformEducationOrigin,limiter)
router.use((req,res,next)=>['GET','HEAD','OPTIONS'].includes(req.method)?next():requireRecentAdminKey(req,res,next))
const configurationBase='/organizations/:organizationId/products/:product/standard-configurations'
router.use(configurationBase,(_req,res,next)=>{res.setHeader('Cache-Control','no-store');next()})
const configurationScope=(req:Request)=>({product:product.parse(req.params.product)==='HUISCHOOL'?'SCHOOL' as const:'TEACHER' as const,
 organizationId:uuid.parse(req.params.organizationId)})
const configurationId=(req:Request)=>uuid.parse(req.params.combinationId)
const sourceQuery=z.object({combinationHash:z.string().regex(/^[a-f0-9]{64}$/)}).strict()
router.get(configurationBase,handle(req=>educationStandardManagementCatalog(req.user!.userId,configurationScope(req),req.query)))
router.get(configurationBase+'/:combinationId/preview',handle(req=>educationStandardManagementPreview(req.user!.userId,configurationScope(req),configurationId(req),sourceQuery.parse(req.query).combinationHash)))
router.get(configurationBase+'/:combinationId/recipients',handle(req=>{
 const input=sourceQuery.extend({page:z.coerce.number().int().min(1).max(10000).default(1),q:z.string().trim().max(120).default('')}).parse(req.query)
 return educationStandardManagementRecipients(req.user!.userId,configurationScope(req),configurationId(req),input.combinationHash,{page:input.page,q:input.q})
}))
router.get(configurationBase+'/:combinationId/use-grants',handle(req=>educationStandardManagementGrants(req.user!.userId,configurationScope(req),configurationId(req),req.query)))
router.get(configurationBase+'/:combinationId/operations/:requestId',handle(req=>educationStandardManagementOperation(req.user!.userId,configurationScope(req),configurationId(req),uuid.parse(req.params.requestId))))
router.post(configurationBase+'/:combinationId/use-grants',handle(async req=>{
 const {currentPassword,...input}=educationStandardUseInput.extend({configurationName:educationStandardUseInput.shape.configurationName.unwrap(),currentPassword:password}).parse(req.body)
 await adminStepUp(req,currentPassword)
 return grantEducationStandardConfigurationUse(req.user!.userId,configurationScope(req),configurationId(req),input)
}))
router.post(configurationBase+'/:combinationId/use-grants/:grantId/revoke',handle(async req=>{
 const {currentPassword,...input}=educationStandardRevokeInput.extend({currentPassword:password}).parse(req.body)
 await adminStepUp(req,currentPassword)
 return revokeEducationStandardConfigurationUse(req.user!.userId,configurationScope(req),configurationId(req),uuid.parse(req.params.grantId),input)
}))
router.get('/organizations/:organizationId/products',handle(req=>
  readEducationProductEntitlements(req.user!.userId,uuid.parse(req.params.organizationId))))
router.get('/organizations/:organizationId/teacher-admins',handle(req=>
  listEducationTeacherAdmins(req.user!.userId,uuid.parse(req.params.organizationId))))
router.put('/organizations/:organizationId/products/:product',handle(async req=>{
  const id=uuid.parse(req.params.organizationId)
  const p=product.parse(req.params.product) as EducationProduct
  const input=entitlementInput.parse(req.body)
  await adminStepUp(req,input.currentPassword)
  return setEducationProductEntitlement({
    actorUserId:req.user!.userId,organizationId:id,product:p,
    action:input.action,expectedRevision:input.expectedRevision,
    initialSchoolAdminMembershipId:input.initialSchoolAdminMembershipId,
  })
}))
router.post('/organizations/:organizationId/teacher-admins',handle(async req=>{
  const org=uuid.parse(req.params.organizationId),input=grantInput.parse(req.body)
  await adminStepUp(req,input.currentPassword)
  return grantEducationProductAdmin({actorUserId:req.user!.userId,
    organizationId:org,membershipId:input.membershipId})
}))
router.post('/organizations/:organizationId/teacher-admins/:grantId/revoke',handle(async req=>{
  const org=uuid.parse(req.params.organizationId),grantId=uuid.parse(req.params.grantId)
  const input=revokeInput.parse(req.body)
  await adminStepUp(req,input.currentPassword)
  return revokeEducationProductAdmin({actorUserId:req.user!.userId,organizationId:org,grantId})
}))
const licenseInput=z.object({
  action:z.enum(['GRANT','REVOKE']),currentPassword:password,
}).strict()
router.put('/organizations/:organizationId/teacher-scale-licenses/:resourceId',
  handle(async req=>{
    const organizationId=uuid.parse(req.params.organizationId)
    const resourceId=uuid.parse(req.params.resourceId)
    const data=licenseInput.parse(req.body)
    await adminStepUp(req,data.currentPassword)
    return changeTeacherScaleLicense({
      organizationId,resourceId,actorUserId:req.user!.userId,action:data.action,
    })
  }))
// An explicit independent educational-person license; no fake Organization.
const personalGrantSchema=z.object({
  action:z.enum(['GRANT','REVOKE']),
  expectedRevision:z.number().int().min(0).optional(),
  currentPassword:password,
}).strict()
router.put('/personal-scale-grants/:teacherUserId/:resourceId',
  handle(async req=>{
    const userId=uuid.parse(req.params.teacherUserId)
    const resourceId=uuid.parse(req.params.resourceId)
    const body=personalGrantSchema.parse(req.body)
    await adminStepUp(req,body.currentPassword)
    return changeTeacherPersonalGrant({
      actorUserId:req.user!.userId,teacherUserId:userId,resourceId,
      action:body.action,expectedRevision:body.expectedRevision,
    })
  }))
export default router
