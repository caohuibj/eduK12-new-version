import {readPrivateFormRuntimeResource} from '../education-tools/private-tool.form-runtime-resources'
import {privateFormDraftResourcePolicy} from '../education-tools/private-tool.form-draft-policy'
import {assertPrivateScaleRunWorkflow} from './educationPrivateScaleContext'
import {readPrivateScaleRuntimeResource} from '../education-tools/private-tool.runtime-resources'
import {relationalEntryToRunPolicy,type RunResourcePolicy} from './resourceAuthority'
import {isSupportedEducationLibraryVariant} from '../scale-library-governance/education-supported-variants'
import {Prisma} from '@prisma/client'
import type {AuthenticatedPrincipal} from '../../types'
import {assertCurrentRunManagerBoundary} from './resourceBoundary'
import {lockAndAssertCampusActivityEditor} from '../campus/activity.service'
import {readEducationLibraryUse} from '../scale-library-governance/education-use'
import {assertEducationLibraryReadCommitted,lockEducationLibraryOrganization,readEducationLibraryRegisteredSource} from '../scale-library-governance/education-runtime-resources'
import {educationLibraryOriginSchema,educationLibraryResourceKey} from '../scale-library-governance/education-runtime-entry'
import {fail} from '../scale-library-governance/contracts'

type Ref={family:string;key:string;version:string}
type Scope={organizationId:string;runId:string;actorUserId:string}

/** Product is a persisted workflow fact, never a request body hint or the
 * population inferred from an entry name. Non-education runs keep old behavior.
 */
export async function readEducationRunLibraryContext(tx:Prisma.TransactionClient,input:Pick<Scope,'organizationId'|'runId'>){
 const [row]=await tx.$queryRaw<Array<{domain:string;schoolCourseId:string|null;teacherEventId:string|null}>>(Prisma.sql`
  SELECT o.product_domain AS domain,
   (SELECT a.course_id FROM campus_activity_runs a JOIN campus_activities c ON c.organization_id=a.organization_id AND c.course_id=a.course_id
      WHERE a.organization_id=r.organization_id AND a.run_id=r.id) AS "schoolCourseId",
   (SELECT h.event_id FROM huiteacher_evaluation_run_links h JOIN huiteacher_evaluation_events e ON e.organization_id=h.organization_id AND e.id=h.event_id
      WHERE h.organization_id=r.organization_id AND h.run_id=r.id) AS "teacherEventId"
  FROM assessment_runs r JOIN organizations o ON o.id=r.organization_id
  WHERE r.id=${input.runId} AND r.organization_id=${input.organizationId}`)
 if(!row)fail('EDUCATION_LIBRARY_RUN_NOT_FOUND',404)
 if(row.domain!=='SCHOOL')return null
 if(Boolean(row.schoolCourseId)===Boolean(row.teacherEventId))fail('EDUCATION_LIBRARY_EXPLICIT_WORKFLOW_REQUIRED',409)
 return {product:row.teacherEventId?'TEACHER' as const:'SCHOOL' as const,...input,
   schoolCourseId:row.schoolCourseId,teacherEventId:row.teacherEventId}
}

/** Call before any org lock. All selected issuers for all tracks are locked
 * first, then the organization is acquired once. Otherwise a second track could
 * introduce a new user lock after org and invert account-management lock order.
 * Return values are local transaction facts, not durable capabilities.
 */
export async function assertEducationRunLibraryResources(tx:Prisma.TransactionClient,input:Scope&{resources:Ref[];purpose:'EDIT'|'PREVIEW'|'PUBLISH'}){
 const privateRefs=input.resources.filter(ref=>ref.key.startsWith('private-scale:')||ref.key.startsWith('private-form:'))
 if(privateRefs.some(ref=>ref.family!==(ref.key.startsWith('private-form:')?'FORM':'SCALE')||ref.version!=='1.0.0'))fail('PRIVATE_TOOL_RUNTIME_RESOURCE_INVALID',409)
 if(!input.resources.some(ref=>ref.family==='SCALE')&&!privateRefs.length)return null
 const initial=await readEducationRunLibraryContext(tx,input)
 if(!initial){
  if(input.resources.some(ref=>ref.key.startsWith('library-scale:'))||privateRefs.length)fail('EDUCATION_LIBRARY_EXPLICIT_WORKFLOW_REQUIRED',403)
  return null
 }
 if(input.resources.some(ref=>ref.family==='SCALE'&&!ref.key.startsWith('library-scale:')&&!ref.key.startsWith('private-scale:')&&!(initial.product==='TEACHER'&&ref.key.startsWith('teacher-scale:'))))
  fail('SCHOOL_EXPLICIT_LIBRARY_GRANT_REQUIRED',403)
 if(initial.product==='TEACHER'&&!input.resources.some(ref=>ref.key.startsWith('library-scale:'))&&!privateRefs.length)return null
 await assertEducationLibraryReadCommitted(tx)
 const prepared=[]
 for(const ref of [...input.resources].filter(ref=>ref.family==='SCALE'&&ref.key.startsWith('library-scale:')).sort((a,b)=>a.key.localeCompare(b.key))){
  const [row]=await tx.$queryRaw<Array<{origin:unknown}>>(Prisma.sql`SELECT entry->'libraryOrigin' AS origin FROM registered_assessment_resources
    WHERE resource_key=${ref.key} AND resource_version=${ref.version}`)
  if(!row)fail('EDUCATION_LIBRARY_REGISTERED_IDENTITY_MISMATCH')
  const origin=educationLibraryOriginSchema.parse(row.origin)
  if(origin.product!==initial.product||educationLibraryResourceKey(origin)!==ref.key||origin.adapterVersion!==ref.version)
    fail('EDUCATION_LIBRARY_REGISTERED_IDENTITY_MISMATCH')
  const context={product:initial.product,organizationId:input.organizationId,actorId:input.actorUserId,
    entryId:origin.entryId,releaseId:origin.releaseId,contentHash:origin.contentHash}
  const selected=await readEducationLibraryUse(tx,context)
  prepared.push({ref,context,grantId:selected.grantId})
 }
 const current=await lockAndAssertEducationRunWorkflow(tx,input,initial)
 for(const item of prepared){
  await readEducationLibraryUse(tx,item.context,{onlyGrantId:item.grantId})
  const source=await readEducationLibraryRegisteredSource(tx,{product:current.product,resourceKey:item.ref.key,resourceVersion:item.ref.version,purpose:'NEW_USE'})
  if(!isSupportedEducationLibraryVariant(current.product,source.variantKey))fail('EDUCATION_LIBRARY_WORKFLOW_RESPONSE_MODE_UNSUPPORTED',409)
  const expectedPopulation=current.product==='TEACHER'?'TEACHER':'STUDENT'
  if(!source.resourceEntry.applicability.subjectRoles.includes(expectedPopulation))fail('EDUCATION_LIBRARY_WORKFLOW_POPULATION_UNSUPPORTED',409)
 }
 const privateResourcePolicies=new Map<string,RunResourcePolicy>()
 if(privateRefs.length){
  const editor=await assertPrivateScaleRunWorkflow(tx,input,current)
  for(const ref of [...privateRefs].sort((a,b)=>a.key.localeCompare(b.key))){
   const form=ref.key.startsWith('private-form:')
   const source=await (form?readPrivateFormRuntimeResource:readPrivateScaleRuntimeResource)(tx,{key:ref.key,version:'1.0.0',purpose:'NEW_USE',context:editor.context})
   privateResourcePolicies.set(ref.key,form?privateFormDraftResourcePolicy(source):relationalEntryToRunPolicy(source.resourceEntry))
  }
 }
 return {...current,privateResourcePolicies}
}

/** Shared workflow facts only. Public callers must lock selected issuers BEFORE
 * entering here; private author drafts need no issuer locks. No tool use grant. */
export async function lockAndAssertEducationRunWorkflow(tx:Prisma.TransactionClient,input:Scope&{purpose:'EDIT'|'PREVIEW'|'PUBLISH'},initial:NonNullable<Awaited<ReturnType<typeof readEducationRunLibraryContext>>>){
 await lockEducationLibraryOrganization(tx,input.organizationId,initial.product)
 const current=await readEducationRunLibraryContext(tx,input)
 if(!current||current.product!==initial.product||current.schoolCourseId!==initial.schoolCourseId||current.teacherEventId!==initial.teacherEventId)
   fail('EDUCATION_LIBRARY_WORKFLOW_CHANGED')
 let schoolEditor:Awaited<ReturnType<typeof lockAndAssertCampusActivityEditor>>|null=null
 await assertCurrentRunManagerBoundary(input,tx)
 if(current.schoolCourseId){
  const user=await tx.user.findUnique({where:{id:input.actorUserId},select:{id:true,username:true,role:true,platformRole:true,
    tokenVersion:true,mustChangePassword:true,accountDomain:true,teacherApproved:true}})
  if(!user||user.accountDomain!=='SCHOOL')fail('EDUCATION_LIBRARY_MEMBERSHIP_REQUIRED',403)
  const actor:AuthenticatedPrincipal={...user,userId:user.id,accountDomain:'SCHOOL'}
  schoolEditor=await lockAndAssertCampusActivityEditor(tx,{actor,organizationId:input.organizationId,courseId:current.schoolCourseId})
  const {activity}=schoolEditor
  if(input.purpose==='EDIT'&&activity.status!=='DRAFT')fail('EDUCATION_LIBRARY_ACTIVITY_NOT_EDITABLE')
  if(input.purpose==='PREVIEW'&&!['DRAFT','SUBMITTED','OPEN'].includes(activity.status))fail('EDUCATION_LIBRARY_ACTIVITY_NOT_PREVIEWABLE')
  if(input.purpose==='PUBLISH'&&activity.status!=='OPEN')fail('EDUCATION_LIBRARY_ACTIVITY_NOT_OPEN')
 }else{
  const [event]=await tx.$queryRaw<Array<{status:string}>>(Prisma.sql`SELECT status FROM huiteacher_evaluation_events
    WHERE id=${current.teacherEventId} AND organization_id=${input.organizationId} FOR SHARE`)
  if(!event||(input.purpose==='PREVIEW'&&!['DRAFT','OPEN'].includes(event.status))||(input.purpose==='EDIT'&&event.status!=='DRAFT')||(input.purpose==='PUBLISH'&&event.status!=='OPEN'))
    fail('EDUCATION_LIBRARY_EVENT_UNAVAILABLE')
 }
 return {...current,schoolEditor}
}
