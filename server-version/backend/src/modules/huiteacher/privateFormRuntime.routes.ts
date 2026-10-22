import {Router,type Request,type RequestHandler} from 'express'
import {Prisma} from '@prisma/client'
import {z,ZodError} from 'zod'
import {prisma} from '../../config/database'
import {authenticateHuiteacher} from '../../middleware/auth'
import {asyncHandler} from '../../middleware/asyncHandler'
import {success,notFound} from '../../utils/response'
import {currentRunPopulationAuthoritySql} from '../assessment-run/currentPopulationAuthority'
import {privateFormTrackIdentitySql} from '../assessment-run/educationPrivateFormIdentitySql'
import {boundCompositeContinuationSql} from '../assessment-run/boundCompositeContinuation'
import {readPrivateFormExecutionSource} from '../assessment-run/educationPrivateFormExecution'
import {startAssessmentRunExecution} from '../assessment-run/startExecution'
import {resolveEducationProductMemberScope} from '../organization/educationProductAccess'
import {relationalRuntimeConsentAuthority} from '../assessment-relational/runtime-consent'
import {compositeController} from '../composite/composite.controller'

const router=Router(),uuid=z.string().uuid()
router.use((_req,res,next)=>{res.setHeader('Cache-Control','no-store');next()})
const wrap=(work:(req:Request)=>Promise<unknown>)=>asyncHandler(async(req,res)=>{
 try{return success(res,await work(req))}catch(error){
  if(error instanceof ZodError)return res.status(400).json({code:'HUITEACHER_PRIVATE_FORM_INPUT_INVALID',message:'表单任务参数无效',data:null})
  const e=error as {code?:string;statusCode?:number;message?:string}
  if(typeof e.statusCode==='number'&&e.statusCode>=400&&e.statusCode<500)return res.status(e.statusCode).json({code:e.code??'HUITEACHER_PRIVATE_FORM_UNAVAILABLE',message:e.message??'表单任务不可用',data:null})
  throw error
 }
})
type Task={executionId:string;runId:string;organizationId:string;eventId:string;eventTitle:string;eventStatus:string;formTitle:string;
 status:string;runStatus:string;runtimeBindingKind:string|null;runtimeBindingRef:string|null}
/** Exact current task list, not the author's private-tool catalogue. */
export async function listOwnTeacherPrivateFormTasks(actorUserId:string,filter?:{executionId?:string;attemptId?:string}){
 return prisma.$queryRaw<Task[]>(Prisma.sql`
  SELECT e.id AS "executionId",e.run_id AS "runId",e.organization_id AS "organizationId",event.id AS "eventId",
   event.title AS "eventTitle",event.status AS "eventStatus",c.name AS "formTitle",e.status,r.status AS "runStatus",
   e.runtime_binding_kind AS "runtimeBindingKind",e.runtime_binding_ref AS "runtimeBindingRef"
  FROM assessment_run_executions e JOIN assessment_runs r ON r.id=e.run_id AND r.organization_id=e.organization_id
  JOIN assessment_run_tracks t ON t.id=e.track_id AND t.run_id=e.run_id AND t.organization_id=e.organization_id
  JOIN huiteacher_evaluation_run_links link ON link.run_id=e.run_id AND link.organization_id=e.organization_id
  JOIN huiteacher_evaluation_events event ON event.id=link.event_id AND event.organization_id=link.organization_id
  JOIN relational_assessment_assignments a ON a.id=e.relational_assignment_id AND a.policy_domain='ORGANIZATION_RUN'
   AND a.resource_kind=t.resource_family AND a.resource_key=t.resource_key AND a.resource_version=t.resource_version
  JOIN composite_assessments c ON c.creation_key=t.resource_key
  WHERE a.respondent_user_id=${actorUserId} AND a.subject_user_id=${actorUserId}
   AND a.relationship_kind='SELF' AND a.respondent_role='TEACHER' AND a.subject_role='TEACHER'
   AND a.status NOT IN ('REVOKED','EXPIRED') AND e.status IN ('ASSIGNED','STARTED','COMPLETED')
   AND ${privateFormTrackIdentitySql({track:Prisma.sql`t`,organizationId:Prisma.sql`e.organization_id`,product:'TEACHER'})}
   AND ${currentRunPopulationAuthoritySql(Prisma.sql`e.id`)}
   AND (r.status='PUBLISHED' OR (r.status='CLOSED' AND e.status='STARTED' AND ${boundCompositeContinuationSql(Prisma.sql`e.id`,actorUserId)})
    OR (r.status='CLOSED' AND e.status='COMPLETED' AND e.runtime_binding_kind='COMPOSITE'
      AND EXISTS(SELECT 1 FROM composite_assessment_attempts completed_parent
       WHERE completed_parent.id=e.runtime_binding_ref AND completed_parent.composite_assessment_id=c.id
        AND completed_parent.assignment_ref=a.id AND completed_parent.user_id=${actorUserId} AND completed_parent.status='COMPLETED')))
   ${filter?.executionId?Prisma.sql`AND e.id=${filter.executionId}`:Prisma.empty}
   ${filter?.attemptId?Prisma.sql`AND e.runtime_binding_kind='COMPOSITE' AND e.runtime_binding_ref=${filter.attemptId}`:Prisma.empty}
  ORDER BY e.created_at DESC,e.id DESC LIMIT 101`)
}
async function own(actorUserId:string,filter:{executionId?:string;attemptId?:string}){
 const [row]=await listOwnTeacherPrivateFormTasks(actorUserId,filter)
 if(!row||!await resolveEducationProductMemberScope({actorUserId,organizationId:row.organizationId,product:'HUITEACHER'}))return null
 await readPrivateFormExecutionSource(prisma,{executionId:row.executionId,actorUserId,...(filter.attemptId?{parentAttemptId:filter.attemptId}:{})})
 return row
}
const requireAttempt:RequestHandler=(req,res,next)=>{
 void own(req.user!.userId,{attemptId:uuid.parse(req.params.attemptId)}).then(row=>{
  if(!row){notFound(res,'表单任务不可用');return}next()
 }).catch(next)
}
const finalConsent:RequestHandler=(req,_res,next)=>{
 void relationalRuntimeConsentAuthority.assertCompositeFinal(req.params.attemptId,req.user!.userId).then(()=>next()).catch(next)
}
router.get('/my-private-form-tasks',authenticateHuiteacher,wrap(async req=>({list:await listOwnTeacherPrivateFormTasks(req.user!.userId)})))
router.post('/run-executions/:executionId/start-private-form',authenticateHuiteacher,wrap(async req=>{
 const executionId=uuid.parse(req.params.executionId)
 const task=await own(req.user!.userId,{executionId})
 if(!task||!['ASSIGNED','STARTED'].includes(task.status))return {state:'WITHHELD' as const}
 const result=await startAssessmentRunExecution({executionId,actorUserId:req.user!.userId})
 if(result.state==='STARTED'&&result.runtimeBindingKind!=='COMPOSITE')throw new Error('Private Form requires its exact Composite runtime')
 return result
}))
router.get('/private-form-composite-attempts/:attemptId',authenticateHuiteacher,requireAttempt,compositeController.getAttempt)
router.post('/private-form-composite-attempts/:attemptId/form-sections/:sectionId/submit',authenticateHuiteacher,requireAttempt,finalConsent,compositeController.submitFinalFormSection)
export default router
