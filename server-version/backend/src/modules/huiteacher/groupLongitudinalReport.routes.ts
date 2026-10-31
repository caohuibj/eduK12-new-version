import {Router} from 'express'
import {z,ZodError} from 'zod'
import {authenticateHuiteacher} from '../../middleware/auth'
import {asyncHandler} from '../../middleware/asyncHandler'
import {success} from '../../utils/response'
import {requireTeacherProductAdmin,requireRecentTeacherMfa} from './authority'
import {groupLongitudinalRequestSchema} from '../reporting/group-longitudinal'
import {educationGroupSelectionSchema} from '../reporting/education-group-selection'
import {taskArtifactBefore} from '../reporting/task-artifact'
import {teacherGroupLongitudinalCatalog,generateTeacherGroupLongitudinal,readTeacherGroupLongitudinal} from './groupLongitudinalReport.service'

const router=Router(),uuid=z.string().guid()
const base='/organizations/:organizationId/evaluation-events/:eventId/group-longitudinal-reports'
const query=z.object({configure:z.enum(['true','false']).default('false'),beforeGeneratedAt:z.string().optional(),beforeArtifactId:uuid.optional()}).strict()
const generate=groupLongitudinalRequestSchema.extend({specId:uuid,selection:educationGroupSelectionSchema.default({kind:'ALL'})})
const handler=(action:'index'|'read'|'generate')=>asyncHandler(async(req,res)=>{
 try{
  const scope={organizationId:uuid.parse(req.params.organizationId),eventId:uuid.parse(req.params.eventId),actorUserId:req.user!.userId}
  const options=action==='index'?query.parse(req.query):null
  const value=action==='index'?await teacherGroupLongitudinalCatalog({...scope,configure:options!.configure==='true',before:taskArtifactBefore(options!)}):action==='read'
   ?await readTeacherGroupLongitudinal({...scope,artifactId:uuid.parse(req.params.artifactId)})
   :await generateTeacherGroupLongitudinal({...scope,...generate.parse(req.body)})
  return success(res,value)
 }catch(error){
  if(error instanceof ZodError)return res.status(400).json({code:'HUITEACHER_REPORT_ARGUMENT_INVALID',message:'纵向群体报告参数无效',data:null})
  const known=error as {statusCode?:number;code?:string;message?:string}
  if(typeof known.statusCode==='number'&&known.statusCode>=400&&known.statusCode<600)return res.status(known.statusCode).json({code:known.code??'HUITEACHER_REPORT_DENIED',message:known.message??'纵向群体报告条件不满足',data:null})
  throw error
 }
})
router.use((_req,res,next)=>{res.setHeader('Cache-Control','no-store');next()})
// Retain the existing Teacher administrative-session and current product grant.
// Only generation needs the same recent MFA as the existing numeric report.
router.get(base,authenticateHuiteacher,requireTeacherProductAdmin,handler('index'))
router.get(base+'/:artifactId',authenticateHuiteacher,requireTeacherProductAdmin,handler('read'))
router.post(base,authenticateHuiteacher,requireTeacherProductAdmin,requireRecentTeacherMfa,handler('generate'))
export default router
