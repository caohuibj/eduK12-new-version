import {Prisma} from '@prisma/client'
import {prisma} from '../../config/database'
import {resolveEducationProductMemberScope} from '../organization/educationProductAccess'

export class HuiteacherTimelineError extends Error{
  constructor(public readonly code:string,public readonly statusCode=403){
    super(code);this.name='HuiteacherTimelineError'
  }
}
const denied=(code:string,status=403):never=>{throw new HuiteacherTimelineError(code,status)}
type Version={family:string;key:string;version:string}

/**
 * Longitudinal metadata, NOT a longitudinal score or automatic comparison.
 * Only school Teacher-product administrators see target/event chronology.
 * No personal attempts, raw FINAL, student respondent IDs, timestamps,
 * scorer outputs, or disclosure-ledger bypass.
 */
export async function readHuiteacherTargetTimeline(input:{
  organizationId:string;actorUserId:string;targetId:string;cursor?:string
}){
  return prisma.$transaction(async tx=>{
    const member=await resolveEducationProductMemberScope({
      actorUserId:input.actorUserId,organizationId:input.organizationId,
      product:'HUITEACHER',
    },tx)
    if(!member?.productAdmin)denied('HUITEACHER_TIMELINE_ADMIN_REQUIRED')
    const target=await tx.huiteacherEvaluationTarget.findFirst({
      where:{id:input.targetId,organizationId:input.organizationId},
      select:{id:true,name:true,kind:true,status:true,subjectUserId:true},
    })
    if(!target)denied('HUITEACHER_TIMELINE_TARGET_NOT_FOUND',404)
    if(input.cursor){
      const validCursor=await tx.huiteacherEvaluationEvent.findFirst({
        where:{id:input.cursor,organizationId:input.organizationId,targetId:input.targetId},
        select:{id:true},
      })
      if(!validCursor)denied('HUITEACHER_TIMELINE_CURSOR_INVALID',400)
    }
    const events=await tx.huiteacherEvaluationEvent.findMany({
      where:{organizationId:input.organizationId,targetId:input.targetId},
      select:{id:true,title:true,kind:true,status:true,version:true,
        createdAt:true,openedAt:true,closedAt:true,scheduledAt:true},
      orderBy:[{createdAt:'desc'},{id:'desc'}],
      ...(input.cursor?{cursor:{id:input.cursor},skip:1}:{}),
      take:101,
    })
    const page=events.slice(0,100)
    const eventIds=page.map(x=>x.id)
    if(!eventIds.length)return {target,list:[],nextCursor:null,
      interpretation:'SOURCE_METADATA_ONLY' as const}
    const [links,studentConfigs]=await Promise.all([
      tx.huiteacherEvaluationRunLink.findMany({
        where:{organizationId:input.organizationId,eventId:{in:eventIds}},
        select:{eventId:true,runId:true},
      }),
      tx.huiteacherStudentEvaluationConfig.findMany({
        where:{organizationId:input.organizationId,eventId:{in:eventIds}},
        select:{eventId:true},
      }),
    ])
    const byEvent=new Map(links.map(x=>[x.eventId,x.runId]))
    const studentIds=new Set(studentConfigs.map(x=>x.eventId))
    const runIds=links.map(x=>x.runId)
    const versions=runIds.length
      ?await tx.$queryRaw<Array<{
        runId:string;family:string;key:string;version:string;
      }>>(Prisma.sql`
        SELECT "run_id" AS "runId","resource_family" AS "family",
          "resource_key" AS "key","resource_version" AS "version"
        FROM "assessment_run_tracks"
        WHERE "organization_id"=${input.organizationId}
          AND "run_id" IN (${Prisma.join(runIds)})
        ORDER BY "run_id","id"
      `)
      :[]
    const byRun=new Map<string,Version[]>()
    for(const row of versions){
      const previous=byRun.get(row.runId)||[]
      previous.push({family:row.family,key:row.key,version:row.version})
      byRun.set(row.runId,previous)
    }
    const list=page.map(event=>{
      const resources=byRun.get(byEvent.get(event.id)??'')??[]
      return {
        eventId:event.id,title:event.title,kind:event.kind,
        status:event.status,version:event.version,
        createdAt:event.createdAt,openedAt:event.openedAt,
        closedAt:event.closedAt,scheduledAt:event.scheduledAt,
        sourceKind:studentIds.has(event.id)?'STUDENT_FEEDBACK'
          :byEvent.has(event.id)?'ASSESSMENT_RUN'
          :['CLASSROOM','MEETING','TEACHING_RESEARCH','FIELD_VISIT'].includes(event.kind)
            ?'FIELD_ACTIVITY':'UNLINKED_DRAFT',
        instrumentVersions:resources,
        // Similar title, participants, or raw Likert options are NEVER
        // sufficient to claim numeric comparability or causal change.
        interpretation:'SOURCE_METADATA_ONLY' as const,
        scoresReleased:false as const,
        compared:false as const,
      }
    })
    // Pair only events for the SAME stable target and the same activity
    // kind, newest to oldest within this page. Version identity alone never
    // grants numeric comparability, respondent overlap or causality.
    const priorClosedByKind=new Map<string,typeof list[number]>()
    const annotated=Array.from({length:list.length},(_,index)=>list[index])
    for(let index=list.length-1;index>=0;index--){
      const current=list[index]
      const previous=priorClosedByKind.get(current.kind)
      const privateStudent=current.sourceKind==='STUDENT_FEEDBACK'
        ||previous?.sourceKind==='STUDENT_FEEDBACK'
      const currentVersions=current.instrumentVersions.map(v=>
        [v.family,v.key,v.version].join(':')).sort()
      const oldVersions=previous?.instrumentVersions.map(v=>
        [v.family,v.key,v.version].join(':')).sort()??[]
      const exactVersions=previous&&currentVersions.length>0
        &&currentVersions.length===oldVersions.length
        &&currentVersions.every((value,i)=>value===oldVersions[i])
      const reason=!previous?'NO_CLOSED_BASELINE':
        privateStudent?'STUDENT_POPULATION_DIFFERENCING_BLOCKED':
        !exactVersions?'RESOURCE_SET_OR_VERSION_DIFFERENT':
        'RATERS_CONTEXT_AND_MEASUREMENT_INVARIANCE_UNVERIFIED'
      annotated[index]={...current,comparisonEvidence:{
        previousEventId:previous?.eventId??null,
        sourceMatch:Boolean(previous&&exactVersions&&!privateStudent),
        reason,
        numericTrendAllowed:false as const,
        evidenceGrade:'PROVENANCE_ONLY' as const,
      }} as typeof list[number]
      if(current.status==='CLOSED')priorClosedByKind.set(current.kind,current)
    }
    return {
      target,list:annotated,nextCursor:events.length>100?page[99].id:null,
      interpretation:'SOURCE_METADATA_ONLY' as const,
      note:'同一稳定对象的事件按类型显示相邻正式来源。即使工具版本相同，也只证明部分来源一致；评分者、情境、测量等值性及隐私须另审查。本页绝不展示未授权成绩或计算跨期数字趋势；分页边界不作为完整历史比较证据。',
    }
  })
}
