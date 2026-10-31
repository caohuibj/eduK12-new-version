import {Router,type Request,type RequestHandler} from 'express'
import {z} from 'zod'
import {asyncHandler} from '../../middleware/asyncHandler'
import {success} from '../../utils/response'
import {ContentAuthorityError} from '../measurement-content/content-authority'
import {ContentReleaseError} from '../measurement-content/release'
import {EducationNativeBundleError} from '../bundle-product/education-identity'
import {EducationAssessmentSourceError} from './assessment-resource.repository'
import {EducationAssessmentManagementError,type EducationAssessmentContext} from './assessment-resource.issuer'
import * as service from './assessment-resource.service'
import {educationPackageReferenceSchema} from './package-reference.contracts'
import {EducationPrivateToolError} from './private-tool.contracts'

/** Mounted behind matching education session auth, or the EXISTING system admin
 * management origin + WebAuthn/TOTP boundary. No Training cookie is read here.
 * The product is selected by the authenticated router, never by the JSON body. */
export function educationAssessmentResourceRouter(product:'SCHOOL'|'TEACHER',requireRecentMfa:RequestHandler){
 const router=Router({mergeParams:true}),id=z.string().guid()
 const pageQuery=z.object({cursor:id.optional()}).strict()
 const sourceQuery=pageQuery.extend({publicPackage:z.string().max(600).transform((value,ctx)=>{
  try{return JSON.parse(value) as unknown}catch{ctx.addIssue({code:'custom',message:'Invalid package reference'});return z.NEVER}
 }).pipe(educationPackageReferenceSchema).optional()}).strict()
 const context=(req:Request):EducationAssessmentContext=>{
  if(!req.user)throw new EducationAssessmentManagementError('UNAUTHENTICATED',401)
  return {principal:req.user,product,organizationId:id.parse(req.params.organizationId)}
 }
 const handle=(work:(req:Request)=>Promise<unknown>)=>asyncHandler(async(req,res)=>{
  res.setHeader('Cache-Control','no-store')
  try{return success(res,await work(req))}
  catch(error){
   if(error instanceof z.ZodError)return res.status(400).json({code:'EDUCATION_ASSESSMENT_INPUT_INVALID',message:'测评资源参数无效',data:null})
   if(error instanceof ContentAuthorityError)return res.status(403).json({code:error.code,message:error.code,data:null})
   if(error instanceof EducationAssessmentManagementError||error instanceof EducationAssessmentSourceError||error instanceof ContentReleaseError||error instanceof EducationNativeBundleError||error instanceof EducationPrivateToolError)
    return res.status('statusCode' in error?Number(error.statusCode):409).json({code:error.code,message:error.code,data:null})
   throw error
  }
 })
 router.get('/',handle(req=>service.listEducationAssessmentRegistrations(context(req),pageQuery.parse(req.query).cursor)))
 router.get('/source-candidates',handle(req=>{const query=sourceQuery.parse(req.query);return service.listEducationAssessmentSourceCandidates(context(req),query.cursor,query.publicPackage)}))
 router.post('/preparations',requireRecentMfa,handle(req=>service.prepareEducationAssessment(context(req),req.body)))
 router.get('/preparations/:resourceId',handle(req=>service.readEducationAssessmentPreparation(context(req),id.parse(req.params.resourceId))))
 router.get('/preparations/:resourceId/content-choices',handle(req=>service.listEducationAssessmentContentChoices(context(req),id.parse(req.params.resourceId),pageQuery.parse(req.query).cursor)))
 router.post('/preparations/:resourceId/register',requireRecentMfa,handle(req=>service.registerEducationAssessment(context(req),id.parse(req.params.resourceId),req.body)))
 router.get('/:resourceId',handle(req=>service.readEducationAssessmentRegistration(context(req),id.parse(req.params.resourceId))))
 for(const [path,action] of [['review','REVIEW'],['publish','PUBLISH'],['retire','RETIRE']] as const)
  router.post(`/:resourceId/${path}`,requireRecentMfa,handle(req=>service.transitionEducationAssessment(context(req),id.parse(req.params.resourceId),action,req.body)))
 return router
}
