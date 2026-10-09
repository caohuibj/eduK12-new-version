import { randomUUID } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { prisma } from '../../config/database'
import type { AuthenticatedPrincipal } from '../../types'
import {
  CampusActivityError,lockAndAssertCampusActivityEditor,assertCampusActivityGovernor,
} from './activity.service'
import { createAssessmentRunDraft } from '../assessment-run/repository'
import { appendAudit } from '../organization/service'

const deny=(code:string,statusCode=409):never=>{throw new CampusActivityError(code,statusCode)}
const attached=async(tx:Prisma.TransactionClient,org:string,course:string,run:string)=>{
  const rows=await tx.$queryRaw<Array<{runStatus:string;activityStatus:string}>>`
    SELECT r."status" AS "runStatus",a."status" AS "activityStatus"
    FROM "campus_activity_runs" ar
    JOIN "campus_activities" a ON a."organization_id"=ar."organization_id"
      AND a."course_id"=ar."course_id"
    JOIN "assessment_runs" r ON r."id"=ar."run_id" AND r."organization_id"=ar."organization_id"
    WHERE ar."organization_id"=${org} AND ar."course_id"=${course}
      AND ar."run_id"=${run} LIMIT 1
  `
  return rows[0]??deny('ACTIVITY_RUN_NOT_LINKED',404)
}
/** Shared authorization. A teacher may edit draft tracks only within their
 * Activity role, while Run-scoped manager authority remains an independent
 * backend check in assessmentRunController.
 */
export async function assertCampusActivityRunEditor(input:{
  actor:AuthenticatedPrincipal;organizationId:string;courseId:string;runId:string
}){
  return prisma.$transaction(async tx=>{
    const {activity}=await lockAndAssertCampusActivityEditor(tx,input)
    const run=await attached(tx,input.organizationId,input.courseId,input.runId)
    if(!['DRAFT','SUBMITTED','OPEN'].includes(activity.status))deny('ACTIVITY_RUN_EDIT_DENIED')
    return {activity,run}
  })
}
export async function assertCampusActivityRunGovernor(input:{
  actor:AuthenticatedPrincipal;organizationId:string;courseId:string;runId:string
}){
  const {activity}=await assertCampusActivityGovernor(input)
  const run=await prisma.$transaction(tx=>attached(tx,input.organizationId,input.courseId,input.runId))
  return {activity,run}
}
export async function createCampusActivityRunDraft(input:{
  actor:AuthenticatedPrincipal;organizationId:string;courseId:string
  name:string;intakeDeadline?:Date|null
}){
  return prisma.$transaction(async tx=>{
    const {activity}=await lockAndAssertCampusActivityEditor(tx,input)
    if(activity.status!=='DRAFT')deny('ACTIVITY_RUN_DRAFT_FROZEN')
    const run=await createAssessmentRunDraft({
      tx,organizationId:input.organizationId,name:input.name,
      createdByUserId:input.actor.userId,intakeDeadline:input.intakeDeadline??null,
    })
    await tx.$executeRaw`
      INSERT INTO "campus_activity_runs" (
        "course_id","organization_id","run_id","bound_by_user_id"
      ) VALUES (
        ${input.courseId},${input.organizationId},${run.id},${input.actor.userId}
      )
    `
    await appendAudit(tx,{
      organizationId:input.organizationId,actorUserId:input.actor.userId,
      action:'CAMPUS_ACTIVITY_RUN_DRAFT_CREATED',targetType:'RUN',targetId:run.id,
      domainEventId:randomUUID(),payload:{courseId:input.courseId},
    })
    return run
  })
}
/** Optional association of existing SAME-ORG unpublished Run. No legacy,
 * published or second-Activity linkage is accepted.
 */
export async function bindCampusActivityRun(input:{
  actor:AuthenticatedPrincipal;organizationId:string;courseId:string;runId:string
}){
  return prisma.$transaction(async tx=>{
    const {activity,context}=await lockAndAssertCampusActivityEditor(tx,input)
    if(activity.status!=='DRAFT')deny('ACTIVITY_RUN_DRAFT_FROZEN')
    const rows=await tx.$queryRaw<Array<{createdByUserId:string;status:string}>>`
      SELECT "created_by_user_id" AS "createdByUserId","status" FROM "assessment_runs"
      WHERE "id"=${input.runId} AND "organization_id"=${input.organizationId}
      FOR UPDATE
    `
    const run=rows[0]
    if(!run||run.status!=='DRAFT')deny('ACTIVITY_RUN_INVALID',404)
    if(run.createdByUserId!==input.actor.userId &&
      !(context.orgRole==='ORG_ADMIN'&&context.canGovern))deny('ACTIVITY_RUN_OWNER_REQUIRED',403)
    const duplicates=await tx.$queryRaw<Array<{id:string}>>`
      SELECT "run_id" AS "id" FROM "campus_activity_runs"
      WHERE "run_id"=${input.runId} LIMIT 1
    `
    if(duplicates.length)deny('ACTIVITY_RUN_ALREADY_BOUND')
    await tx.$executeRaw`
      INSERT INTO "campus_activity_runs" (
        "course_id","organization_id","run_id","bound_by_user_id"
      ) VALUES (
        ${input.courseId},${input.organizationId},${input.runId},${input.actor.userId}
      )
    `
    await appendAudit(tx,{
      organizationId:input.organizationId,actorUserId:input.actor.userId,
      action:'CAMPUS_ACTIVITY_RUN_BOUND',targetType:'RUN',targetId:input.runId,
      domainEventId:randomUUID(),payload:{courseId:input.courseId},
    })
    return {runId:input.runId,linked:true}
  })
}
