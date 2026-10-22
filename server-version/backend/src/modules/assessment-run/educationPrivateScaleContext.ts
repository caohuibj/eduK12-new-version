import {Prisma} from '@prisma/client'
import {readEducationRunLibraryContext,lockAndAssertEducationRunWorkflow} from './educationLibraryContext'
import {assertEducationLibraryReadCommitted} from '../scale-library-governance/education-runtime-resources'
import {readPrivateFormRuntimeResource} from '../education-tools/private-tool.form-runtime-resources'
import {readPrivateScaleRuntimeResource} from '../education-tools/private-tool.runtime-resources'
import {privateToolFail,type PrivateToolContext} from '../education-tools/private-tool.contracts'

/** Current draft editor facts only; neither private ownership nor this check
 * confers event publication authority or participant/report access. */
export async function assertPrivateScaleRunEditor(tx:Prisma.TransactionClient,input:{organizationId:string;runId:string;actorUserId:string}){
 await assertEducationLibraryReadCommitted(tx)
 const initial=await readEducationRunLibraryContext(tx,input)
 if(!initial)privateToolFail('PRIVATE_TOOL_WORKFLOW_REQUIRED',403)
 const workflow=await lockAndAssertEducationRunWorkflow(tx,{...input,purpose:'EDIT'},initial)
 return assertPrivateScaleRunWorkflow(tx,input,workflow)
}

/** Reuse current owner boundaries after the batch caller has locked all public
 * issuers, then org/workflow. This function takes no user or issuer locks. */
export async function assertPrivateScaleRunWorkflow(tx:Prisma.TransactionClient,input:{organizationId:string;runId:string;actorUserId:string},workflow:Awaited<ReturnType<typeof lockAndAssertEducationRunWorkflow>>){
 if(workflow.teacherEventId&&await tx.huiteacherStudentEvaluationConfig.findUnique({
  where:{organizationId_eventId:{organizationId:input.organizationId,eventId:workflow.teacherEventId}},select:{id:true}}))
  privateToolFail('HUITEACHER_STUDENT_EVAL_TRACK_READONLY',403)
 const school=workflow.schoolEditor
 const schoolAdmin=Boolean(school&&school.context.orgRole==='ORG_ADMIN'&&school.context.canGovern)
 if(school&&!schoolAdmin&&school.activity.ownerMembershipId!==school.context.membershipId)
  privateToolFail('PRIVATE_TOOL_OWN_ACTIVITY_REQUIRED',403)
 const context:PrivateToolContext={entry:workflow.product,organizationId:input.organizationId,
  principal:{userId:input.actorUserId,accountDomain:'SCHOOL'}}
 return {workflow,context,schoolAdmin}
}
export async function assertPrivateScaleRunResource(tx:Prisma.TransactionClient,input:{organizationId:string;runId:string;actorUserId:string;resource:{key:string;version:string}}){
 const editor=await assertPrivateScaleRunEditor(tx,input)
 if(input.resource.version!=='1.0.0')privateToolFail('PRIVATE_TOOL_RUNTIME_RESOURCE_INVALID')
 const source=await readPrivateScaleRuntimeResource(tx,{key:input.resource.key,version:'1.0.0',purpose:'NEW_USE',context:editor.context})
 return {...editor,source}
}

export async function assertPrivateFormRunResource(tx:Prisma.TransactionClient,input:{organizationId:string;runId:string;actorUserId:string;resource:{key:string;version:string}}){
 const editor=await assertPrivateScaleRunEditor(tx,input)
 if(input.resource.version!=='1.0.0')privateToolFail('PRIVATE_TOOL_RUNTIME_RESOURCE_INVALID')
 const source=await readPrivateFormRuntimeResource(tx,{key:input.resource.key,version:'1.0.0',purpose:'NEW_USE',context:editor.context})
 return {...editor,source}
}

/** Advisory source preparation only. Publication repeats current author and
 * workflow checks in its locked transaction; this does not confer use rights. */
export async function readPrivateScaleRunSourceForPreparation(tx:Prisma.TransactionClient,input:{organizationId:string;runId:string;actorUserId:string;resource:{family:string;key:string;version:string}}){
 if(input.resource.family!=='SCALE'||input.resource.version!=='1.0.0')privateToolFail('PRIVATE_TOOL_RUNTIME_RESOURCE_INVALID')
 const workflow=await readEducationRunLibraryContext(tx,input)
 if(!workflow)privateToolFail('PRIVATE_TOOL_WORKFLOW_REQUIRED',403)
 return readPrivateScaleRuntimeResource(tx,{key:input.resource.key,version:'1.0.0',purpose:'NEW_USE',context:{
  entry:workflow.product,organizationId:input.organizationId,principal:{userId:input.actorUserId,accountDomain:'SCHOOL'}}})
}

/** FORM source preparation shares the real workflow, not legacy TeacherForm
 * licensing. Mutation authority is repeated under the publication locks. */
export async function readPrivateFormRunSourceForPreparation(tx:Prisma.TransactionClient,input:{organizationId:string;runId:string;actorUserId:string;resource:{family:string;key:string;version:string}}){
 if(input.resource.family!=='FORM'||input.resource.version!=='1.0.0')privateToolFail('PRIVATE_TOOL_RUNTIME_RESOURCE_INVALID')
 const workflow=await readEducationRunLibraryContext(tx,input)
 if(!workflow)privateToolFail('PRIVATE_TOOL_WORKFLOW_REQUIRED',403)
 return readPrivateFormRuntimeResource(tx,{key:input.resource.key,version:'1.0.0',purpose:'NEW_USE',context:{
  entry:workflow.product,organizationId:input.organizationId,principal:{userId:input.actorUserId,accountDomain:'SCHOOL'}}})
}
