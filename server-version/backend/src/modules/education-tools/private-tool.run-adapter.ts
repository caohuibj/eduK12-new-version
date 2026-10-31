import {privateFormDraftResourcePolicy} from './private-tool.form-draft-policy'
import {Prisma} from '@prisma/client'
import {prisma} from '../../config/database'
import {assertPrivateScaleRunEditor} from '../assessment-run/educationPrivateScaleContext'
import {addAssessmentRunTrackDraft,lockRun} from '../assessment-run/repository'
import {assertRunTrackNarrowing,relationalEntryToRunPolicy,type RunTrackNarrowingRequest} from '../assessment-run/resourceAuthority'
import {preparePrivateFormRuntimeResource} from './private-tool.form-runtime-resources'
import {preparePrivateScaleRuntimeResource} from './private-tool.runtime-resources'
import {privateScaleVariant} from './private-tool.runtime-origin'
import {privateToolFail} from './private-tool.contracts'
import {privateRunTrackInput,privateFormRunTrackInput,privateCompositionRunTrackInput,assertPrivateRunSelection,assertPrivateAdministrationSelection} from './private-tool.run-contract'
import {privateCompositionAdministrationSchema} from './private-tool.composition-contracts'
import {schoolPrivateGroupSelectionSchema} from './school-private-group-selection'
import {SELF_GROUP_POLICY_KEY} from '../assessment-policy/self-group-contract'

/** Fixed-version attachment to an EXISTING draft only. No activity/event,
 * approval, publication, participant or report entitlement is created. */
type PrivateRunAttachmentContext={organizationId:string;runId:string;actorUserId:string;parent:{kind:'SCHOOL_ACTIVITY'|'TEACHER_EVENT';id:string}}
export const addPrivateScaleRunTrack=(input:PrivateRunAttachmentContext,raw:unknown)=>addPrivateToolRunTrack(input,raw,'SCALE')
export const addPrivateFormRunTrack=(input:PrivateRunAttachmentContext,raw:unknown)=>addPrivateToolRunTrack(input,raw,'FORM')
/** No preparation/materialization here. The repository resolves the exact
 * sealed source under the actual product workflow/editor and draft CAS. */
export async function addPrivateCompositionRunTrack(input:PrivateRunAttachmentContext,raw:unknown){
 const selected=privateCompositionRunTrackInput.parse(raw)
 const product=input.parent.kind==='SCHOOL_ACTIVITY'?'SCHOOL':'TEACHER'
 return prisma.$transaction(async tx=>{
  // Only the immutable owned administration header chooses the resource key.
  // Current author/workflow/U/CAS remain the repository's one locked write
  // boundary. No request can substitute a response mode.
  const [version]=await tx.$queryRaw<Array<{administration:unknown;groupReporting?:unknown}>>(Prisma.sql`
   SELECT definition->'administration' AS administration,definition->'groupReporting' AS "groupReporting" FROM education_private_tool_versions
   WHERE id=${selected.privateComposition.versionId} AND content_hash=${selected.privateComposition.contentHash}
    AND kind='COMPOSITION' AND entry=${product} AND organization_id=${input.organizationId} AND owner_user_id=${input.actorUserId}`)
  if(!version)privateToolFail('PRIVATE_COMPOSITION_SOURCE_NOT_FOUND',404)
  const administration=privateCompositionAdministrationSchema.parse(version.administration),variant=privateScaleVariant(product,administration)
  const groupReporting=version.groupReporting==null?null:schoolPrivateGroupSelectionSchema.parse(version.groupReporting)
  if(groupReporting&&(variant.variantKey!==(product==='SCHOOL'?'STUDENT:SELF':'TEACHER:SELF')))privateToolFail('SCHOOL_PRIVATE_GROUP_SELECTION_INVALID')
  assertPrivateAdministrationSelection(variant.responseMode,selected)
  return addAssessmentRunTrackDraft({...input,tx,expectedVersion:selected.expectedVersion,expectedRunId:input.runId,
   educationWorkflow:{product,id:input.parent.id},privateComposition:selected.privateComposition,
   resource:{family:'BUNDLE',key:`education-composition:${product}:${selected.privateComposition.versionId}:${variant.variantKey}:1.0.0`,version:'1.0.0'},
   subjectSelector:selected.subjectSelector,respondentSelector:selected.respondentSelector,
   requestedPolicy:{subjectRoles:[variant.subjectRole],respondentRoles:[variant.respondentRole],
    relationshipKinds:variant.relationshipKinds.filter(kind=>kind!=='COURSE_TEACHER_STUDENT'),perspectives:[variant.perspective],
    analysisMode:groupReporting?'COHORT_AGGREGATE':'INDIVIDUAL_ONLY',visibilityPolicyKey:groupReporting?SELF_GROUP_POLICY_KEY:variant.responseMode==='SELF'?'EDUCATION_PRIVATE_COMPOSITION_V1':'observer_private_respondent_v1',
    minimumRespondents:groupReporting?groupReporting.minimumRespondents:null,...(selected.targetPolicy?{targetPolicy:selected.targetPolicy}:{})}})
 },{isolationLevel:Prisma.TransactionIsolationLevel.ReadCommitted})
}
async function addPrivateToolRunTrack(input:PrivateRunAttachmentContext,raw:unknown,kind:'SCALE'|'FORM'){
 const selected=kind==='FORM'?privateFormRunTrackInput.parse(raw):privateRunTrackInput.parse(raw)
 const fixed='privateScale' in selected?selected.privateScale:selected.privateForm
 assertPrivateRunSelection(selected)
 return prisma.$transaction(async tx=>{
  const editor=await assertPrivateScaleRunEditor(tx,input)
  const parentMatches=input.parent?.kind==='SCHOOL_ACTIVITY'
    ?Boolean(input.parent.id&&editor.workflow.schoolCourseId===input.parent.id)
    :input.parent?.kind==='TEACHER_EVENT'&&Boolean(input.parent.id&&editor.workflow.teacherEventId===input.parent.id)
  if(!parentMatches)privateToolFail('PRIVATE_TOOL_RUN_PARENT_MISMATCH',403)
  privateScaleVariant(editor.context.entry,fixed.administration)
  if(editor.context.entry==='SCHOOL'&&!editor.schoolAdmin&&fixed.administration.responseMode==='TEACHER_REPORT'&&selected.targetPolicy?.mode!=='HOMEROOM_TEACHER')
   privateToolFail('PRIVATE_TOOL_HOMEROOM_TARGET_REQUIRED',403)
  const run=await lockRun(tx,input.organizationId,input.runId)
  if(run.status!=='DRAFT'||run.version!==selected.expectedVersion)privateToolFail('PRIVATE_TOOL_RUN_VERSION_CONFLICT')
  // Every editor/state/CAS check above precedes source creation. Any subsequent
  // failure rolls the release, wrapper, composite and track back together.
  const source=kind==='FORM'?await preparePrivateFormRuntimeResource(tx,editor.context,fixed):await preparePrivateScaleRuntimeResource(tx,editor.context,fixed)
  const a=source.resourceEntry.applicability
  const requestedPolicy:RunTrackNarrowingRequest={subjectRoles:[...a.subjectRoles],respondentRoles:[...a.respondentRoles],
   relationshipKinds:a.relationshipKinds.filter(kind=>kind!=='COURSE_TEACHER_STUDENT'),perspectives:[...a.perspectives],
   analysisMode:a.analysisMode,visibilityPolicyKey:a.visibilityPolicyKey,minimumRespondents:a.minimumRespondents,
   ...(selected.targetPolicy?{targetPolicy:selected.targetPolicy}:{})}
  assertRunTrackNarrowing(kind==='FORM'?privateFormDraftResourcePolicy(source):relationalEntryToRunPolicy(source.resourceEntry),requestedPolicy)
  return addAssessmentRunTrackDraft({...input,tx,expectedVersion:selected.expectedVersion,
   resource:{family:kind,key:a.resourceKey,version:a.resourceVersion},subjectSelector:selected.subjectSelector,
   respondentSelector:selected.respondentSelector,requestedPolicy})
 },{isolationLevel:Prisma.TransactionIsolationLevel.ReadCommitted})
}
