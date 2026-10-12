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
    return {
      target,list,nextCursor:events.length>100?page[99].id:null,
      interpretation:'SOURCE_METADATA_ONLY' as const,
      note:'仅按稳定对象排列评价事件和冻结工具版本。不展示未授权成绩、学生评教作答或纵向趋势。需要相同指标、受众及抽样证据的正式验证才能做数值比较。',
    }
  })
}
