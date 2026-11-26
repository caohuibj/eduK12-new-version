import { trainingCourseScope } from '../utils/courseAccess'
import {Router, type Request, type Response, type NextFunction} from 'express'
import {z} from 'zod'
import {authenticate} from '../middleware/auth'
import {requireEntryAdmin, requireRecentAdminKey} from '../modules/admin-permissions/guards'
import {prisma} from '../config/database'
import {courseController} from '../controllers/courseController'
import {scaleController} from '../controllers/scaleController'
import {cognitiveController} from '../modules/cognitive/cognitive.controller'
import {bundleProductService, bundleDefinitionProvider} from '../modules/bundle-product/service'
import {refreshPublishedPackages} from '../modules/bundle-product/admin-authoring'
import {catalogDiscoveryQueryFields} from '../modules/scale/library/catalog-discovery'
import {getPaginationParams} from '../utils/pagination'
import {success, error, notFound} from '../utils/response'
import {UserRole} from '../types'

/** Management summaries and course supervision only. This router never grants
 * teacher authoring, respondent data, or access to another product's courses. */
export const trainingAdminCourseScope = trainingCourseScope
export const trainingAdminCourseEdit = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().max(10000).optional(),
}).strict().refine(value => Object.keys(value).length > 0, '请填写课程名称或说明')
const router = Router()
router.use(authenticate, requireEntryAdmin('TRAINING'), (req,res,next) => {
  // Local compatibility projection, after current DB-backed entry authorization.
  req.user = {...req.user!, role: UserRole.ADMIN}
  res.locals.trainingOversight = true
  res.setHeader('Cache-Control','no-store')
  next()
})
router.param('id', async (_req: Request,res: Response,next: NextFunction,id: string) => {
  try {
    const course=await prisma.course.findFirst({where:{id,...trainingAdminCourseScope},select:{id:true}})
    if(!course)return notFound(res,'课程不存在')
    next()
  } catch(cause) {next(cause)}
})
router.get('/courses',courseController.list)
router.get('/courses/:id/students',courseController.getStudents)
router.put('/courses/:id',requireRecentAdminKey,(req,res,next)=>{
  const input=trainingAdminCourseEdit.safeParse(req.body)
  if(!input.success)return error(res,input.error.issues.map(issue=>issue.message).join('；'),-1,400)
  req.body=input.data
  return courseController.update(req,res)
})
router.post('/courses/:id/stop-recruiting',requireRecentAdminKey,courseController.stopRecruiting)
router.post('/courses/:id/resume-recruiting',requireRecentAdminKey,courseController.resumeRecruiting)
router.post('/courses/:id/end',requireRecentAdminKey,courseController.endCourse)
const summaryOnly=(req:Request,_res:Response,next:NextFunction)=>{
  req.query.view='training-catalog'
  next()
}
router.get('/resources/scales',summaryOnly,scaleController.list)
router.get('/resources/cognitive-configs',summaryOnly,cognitiveController.listConfigs)
router.get('/resources/bundles',async(req,res,next)=>{
  try {
    const filters=z.object({...catalogDiscoveryQueryFields,status:z.string().trim().max(24).optional()}).parse(req.query)
    await refreshPublishedPackages(prisma,bundleDefinitionProvider)
    return success(res,await bundleProductService.catalog(req.user!,{pagination:getPaginationParams(req),filters}))
  } catch(cause) {
    if(cause instanceof z.ZodError)return error(res,'目录筛选参数无效',-1,400)
    next(cause)
  }
})
export default router
