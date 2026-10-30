import {Prisma} from '@prisma/client'
import {prisma} from '../../config/database'
import type {AuthenticatedPrincipal} from '../../types'
import {CampusActivityError,createCampusActivity,lockAndAssertCampusActivityEditor,assertCampusActivityEditor} from './activity.service'
import {createCampusActivityRunDraft} from './activity.runs'
import {allocateCampusActivityParticipants} from './activity.allocation'
import {addAssessmentRunTrackDraft,listRunTracks} from '../assessment-run/repository'
import {type RunResourceRef} from '../assessment-run/resourceAuthority'
import {assertRegisteredResourceUse} from '../assessment-run/registeredResources'
import {educationTrackingChoices,educationTrackingSchema,educationTrackingPolicy} from '../reporting/education-personal-tracking'

type Scope={actor:AuthenticatedPrincipal;organizationId:string;courseId:string;runId:string}
const fail=(code:string):never=>{throw new CampusActivityError(code,409)}
export async function schoolTrackingOptions(input:Scope){
 await assertCampusActivityEditor(input)
 return prisma.$transaction(async tx=>{
  const [run]=await tx.$queryRaw<Array<{status:string;baselineId:string|null;ordinal:number|null}>>`SELECT status,personal_tracking_baseline_id AS "baselineId",personal_tracking_ordinal AS ordinal FROM assessment_runs WHERE id=${input.runId} AND organization_id=${input.organizationId} AND EXISTS(SELECT 1 FROM campus_activity_runs link WHERE link.organization_id=${input.organizationId} AND link.run_id=${input.runId} AND link.course_id=${input.courseId})`
  if(!run)return fail('ACTIVITY_RUN_NOT_FOUND')
  const tracks=await listRunTracks(tx,input.organizationId,input.runId)
  const resolved=await Promise.all(tracks.filter(t=>t.resourceFamily==='SCALE').map(async track=>({id:track.id,resourcePolicy:await educationTrackingPolicy(tx,track,{entry:'SCHOOL',organizationId:input.organizationId,actorUserId:input.actor.userId})})))
  return {baselineId:run.baselineId,ordinal:run.ordinal,choices:run.status==='DRAFT'&&!run.baselineId?await educationTrackingChoices(tx,resolved,'SCHOOL'):[]}
 })
}

/** A fresh native activity keeps its own approval/opening/consent lifecycle.
 * Only the fixed tracked source and currently permitted roster are inherited. */
export async function createNextSchoolTrackingActivity(input:Scope&{requestId:string}){
 await assertCampusActivityEditor(input)
 return prisma.$transaction(async tx=>{
  await tx.$queryRaw`SELECT id FROM organizations WHERE id=${input.organizationId} FOR UPDATE`
  const {activity}=await lockAndAssertCampusActivityEditor(tx,input)
  const [source]=await tx.$queryRaw<Array<{baselineId:string|null;tracking:unknown}>>`SELECT personal_tracking_baseline_id AS "baselineId",personal_tracking AS tracking FROM assessment_runs WHERE organization_id=${input.organizationId} AND id=${input.runId} AND EXISTS(SELECT 1 FROM campus_activity_runs link WHERE link.organization_id=${input.organizationId} AND link.run_id=${input.runId} AND link.course_id=${input.courseId}) AND status IN ('PUBLISHED','CLOSED') FOR UPDATE`
  if(!source?.baselineId)fail('ACTIVITY_TRACKING_NOT_CONFIGURED')
  const tracking=educationTrackingSchema.parse(source.tracking)
  if(tracking.entry!=='SCHOOL')fail('ACTIVITY_TRACKING_ENTRY_MISMATCH')
  await tx.$queryRaw`SELECT id FROM assessment_runs WHERE organization_id=${input.organizationId} AND id=${source.baselineId} FOR UPDATE`
  const [previous]=await tx.$queryRaw<Array<{courseId:string;runId:string;ordinal:number}>>`SELECT link.course_id AS "courseId",run.id AS "runId",run.personal_tracking_ordinal AS ordinal FROM assessment_runs run JOIN campus_activity_runs link ON link.organization_id=run.organization_id AND link.run_id=run.id WHERE run.organization_id=${input.organizationId} AND run.personal_tracking_baseline_id=${source.baselineId} AND run.personal_tracking->>'requestId'=${input.requestId}`
  if(previous)return previous
  const [maximum]=await tx.$queryRaw<Array<{ordinal:number}>>`SELECT max(personal_tracking_ordinal)::int AS ordinal FROM assessment_runs WHERE organization_id=${input.organizationId} AND personal_tracking_baseline_id=${source.baselineId}`
  const ordinal=maximum.ordinal+1
  if(ordinal>100)fail('ACTIVITY_TRACKING_WAVE_LIMIT')
  const tracks=await listRunTracks(tx,input.organizationId,input.runId),track=tracks.find(t=>t.id===tracking.bindings[0].trackId)
  if(!track||tracking.bindings.some(b=>b.trackId!==track.id)||track.resourceFamily!=='SCALE'||!(track.resourceKey.startsWith('private-scale:')||track.resourceKey.startsWith('library-scale:')))return fail('ACTIVITY_TRACKING_SOURCE_UNSUPPORTED')
  const nextActivity=await createCampusActivity({...input,title:activity.title.replace(/ · T\d+$/,'')+' · T'+ordinal,description:activity.description,purpose:activity.purpose,tx})
  const nextScope={...input,courseId:nextActivity.id,tx}
  const roster=await tx.$queryRaw<Array<{membershipId:string;classUnitId:string}>>`SELECT DISTINCT p.membership_id AS "membershipId",sc.class_unit_id AS "classUnitId" FROM campus_activity_participants p JOIN organization_student_class_assignments sc ON sc.organization_id=p.organization_id AND sc.membership_id=p.membership_id AND sc.valid_from<=statement_timestamp() AND (sc.valid_until IS NULL OR sc.valid_until>statement_timestamp()) WHERE p.organization_id=${input.organizationId} AND p.course_id=${input.courseId} AND p.status='ACTIVE' ORDER BY p.membership_id,sc.class_unit_id LIMIT 501`
  const memberships=[...new Set(roster.map(r=>r.membershipId))],classes=[...new Set(roster.map(r=>r.classUnitId))]
  if(!memberships.length||roster.length>500||classes.length>40)fail('ACTIVITY_TRACKING_ROSTER_OUT_OF_BOUNDS')
  await allocateCampusActivityParticipants({...nextScope,classUnitIds:classes,membershipIds:memberships,requestKey:input.requestId,expectedVersion:1})
  const draft=await createCampusActivityRunDraft({...nextScope,name:nextActivity.title})
  const resource={family:track.resourceFamily as RunResourceRef['family'],key:track.resourceKey,version:track.resourceVersion}
  if(!resource.key.startsWith('private-scale:'))await assertRegisteredResourceUse(resource,input.actor.userId,tx,false,{organizationId:input.organizationId,runId:draft.id})
  const next=await addAssessmentRunTrackDraft({organizationId:input.organizationId,runId:draft.id,resource,subjectSelector:track.subjectSelector,respondentSelector:track.respondentSelector,requestedPolicy:track.requestedPolicy,actorUserId:input.actor.userId,expectedVersion:draft.version,tx})
  const stored={schemaVersion:1,entry:'SCHOOL',bindings:tracking.bindings.map(b=>({...b,trackId:next.id})),requestId:input.requestId}
  await tx.$executeRaw`UPDATE assessment_runs SET personal_tracking_baseline_id=${source.baselineId},personal_tracking_ordinal=${ordinal},personal_tracking=${JSON.stringify(stored)}::jsonb WHERE id=${draft.id} AND organization_id=${input.organizationId}`
  return {courseId:nextActivity.id,runId:draft.id,ordinal}
 })
}
