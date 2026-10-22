import {Prisma} from '@prisma/client'
import {prisma} from '../../config/database'
import {assertPrivateScaleRunEditor} from '../assessment-run/educationPrivateScaleContext'
import {addAssessmentRunTrackDraft,lockRun} from '../assessment-run/repository'
import {assertRunTrackNarrowing,relationalEntryToRunPolicy,type RunTrackNarrowingRequest} from '../assessment-run/resourceAuthority'
import {preparePrivateScaleRuntimeResource} from './private-tool.runtime-resources'
import {privateScaleVariant} from './private-tool.runtime-origin'
import {privateToolFail} from './private-tool.contracts'
import {privateRunTrackInput,assertPrivateRunSelection} from './private-tool.run-contract'

/** Fixed-version attachment to an EXISTING draft only. No activity/event,
 * approval, publication, participant or report entitlement is created. */
export async function addPrivateScaleRunTrack(input:{organizationId:string;runId:string;actorUserId:string;parent:{kind:'SCHOOL_ACTIVITY'|'TEACHER_EVENT';id:string}},raw:unknown){
 const selected=privateRunTrackInput.parse(raw)
 assertPrivateRunSelection(selected)
 return prisma.$transaction(async tx=>{
  const editor=await assertPrivateScaleRunEditor(tx,input)
  const parentMatches=input.parent?.kind==='SCHOOL_ACTIVITY'
    ?Boolean(input.parent.id&&editor.workflow.schoolCourseId===input.parent.id)
    :input.parent?.kind==='TEACHER_EVENT'&&Boolean(input.parent.id&&editor.workflow.teacherEventId===input.parent.id)
  if(!parentMatches)privateToolFail('PRIVATE_TOOL_RUN_PARENT_MISMATCH',403)
  privateScaleVariant(editor.context.entry,selected.privateScale.administration)
  if(editor.context.entry==='SCHOOL'&&!editor.schoolAdmin&&selected.privateScale.administration.responseMode==='TEACHER_REPORT'&&selected.targetPolicy?.mode!=='HOMEROOM_TEACHER')
   privateToolFail('PRIVATE_TOOL_HOMEROOM_TARGET_REQUIRED',403)
  const run=await lockRun(tx,input.organizationId,input.runId)
  if(run.status!=='DRAFT'||run.version!==selected.expectedVersion)privateToolFail('PRIVATE_TOOL_RUN_VERSION_CONFLICT')
  // Every editor/state/CAS check above precedes source creation. Any subsequent
  // failure rolls the release, wrapper, composite and track back together.
  const source=await preparePrivateScaleRuntimeResource(tx,editor.context,selected.privateScale)
  const a=source.resourceEntry.applicability
  const requestedPolicy:RunTrackNarrowingRequest={subjectRoles:[...a.subjectRoles],respondentRoles:[...a.respondentRoles],
   relationshipKinds:a.relationshipKinds.filter(kind=>kind!=='COURSE_TEACHER_STUDENT'),perspectives:[...a.perspectives],
   analysisMode:a.analysisMode,visibilityPolicyKey:a.visibilityPolicyKey,minimumRespondents:a.minimumRespondents,
   ...(selected.targetPolicy?{targetPolicy:selected.targetPolicy}:{})}
  assertRunTrackNarrowing(relationalEntryToRunPolicy(source.resourceEntry),requestedPolicy)
  return addAssessmentRunTrackDraft({...input,tx,expectedVersion:selected.expectedVersion,
   resource:{family:'SCALE',key:a.resourceKey,version:a.resourceVersion},subjectSelector:selected.subjectSelector,
   respondentSelector:selected.respondentSelector,requestedPolicy})
 },{isolationLevel:Prisma.TransactionIsolationLevel.ReadCommitted})
}
