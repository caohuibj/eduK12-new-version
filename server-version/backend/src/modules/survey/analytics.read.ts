import { prisma } from '../../config/database'
import { Prisma } from '@prisma/client'

type Tx=Prisma.TransactionClient
export class SurveyAnalyticsError extends Error {
  constructor(readonly statusCode:number,message:string){super(message)}
}
async function authorized(tx:Tx,uid:string,pid:string) {
  const rows=await tx.$queryRaw<Array<{collectionMode:string}>>`
    SELECT p.collection_mode AS "collectionMode"
    FROM "survey_projects" p
    JOIN "users" u ON u.id=p.owner_user_id
    JOIN "survey_researcher_grants" g ON g.user_id=u.id
    JOIN "survey_mfa_credentials" m ON m.user_id=u.id
    WHERE p.id=${pid} AND p.owner_user_id=${uid}
      AND u.account_domain='SURVEY' AND u.is_active AND NOT u.is_frozen
      AND (u.expires_at IS NULL OR u.expires_at>statement_timestamp())
      AND g.status='ACTIVE' AND m.enabled
    LIMIT 1 FOR SHARE OF p,u,g,m
  `
  if(!rows.length)throw new SurveyAnalyticsError(404,'研究项目不存在')
  return rows[0]
}
export async function waveOverview(actorUserId:string,projectId:string){
  return prisma.$transaction(async tx=>{
    const project=await authorized(tx,actorUserId,projectId)
    const waveRows=await tx.$queryRaw<Array<{
      id:string;ordinal:number;title:string;status:string;starts:number;
      finalCompleted:number;uniqueLinkedCodes:number;excluded:number
    }>>`
      SELECT w.id,w.ordinal,w.title,w.status,
        COUNT(swa.id)::int AS starts,
        COUNT(sf.id) FILTER (
          WHERE swa.status='COMPLETED' AND sf.id IS NOT NULL
            AND swa.excluded_at IS NULL
        )::int AS "finalCompleted",
        COUNT(DISTINCT sp.research_code) FILTER (
          WHERE swa.status='COMPLETED' AND sf.id IS NOT NULL
            AND swa.excluded_at IS NULL AND sp.status IN ('ACTIVE','REVOKED')
        )::int AS "uniqueLinkedCodes",
        COUNT(swa.id) FILTER (WHERE swa.excluded_at IS NOT NULL)::int AS excluded
      FROM "survey_waves" w
      LEFT JOIN "survey_wave_attempts" swa ON swa.wave_id=w.id AND swa.project_id=w.project_id
      LEFT JOIN "survey_publications" publication
        ON publication.id=w.publication_id AND publication.project_id=w.project_id
      LEFT JOIN "survey_wave_finals" sf ON sf.attempt_id=swa.id
        AND sf.project_id=w.project_id AND sf.wave_id=w.id
        AND sf.publication_id=publication.id AND sf.definition_digest=publication.definition_digest
      LEFT JOIN "survey_participants" sp ON sp.id=swa.participant_id AND sp.project_id=w.project_id
      WHERE w.project_id=${projectId}
      GROUP BY w.id,w.ordinal,w.title,w.status
      ORDER BY w.ordinal ASC
      LIMIT 100
    `
    return {projectId,collectionMode:project.collectionMode,source:'IMMUTABLE_SURVEY_FINAL_ONLY',
      note:'完成数是权威 Survey FINAL 的答卷数，不代表唯一自然人数；未运行的波次不应推测完成。',
      waves:waveRows.map(w=>({
        ...w,
        uniqueLinkedCodes:project.collectionMode==='LINKED_WAVES'?w.uniqueLinkedCodes:null,
      }))}
  })
}
export async function matchedWaveCounts(input:{
  actorUserId:string;projectId:string;baselineWaveId:string;followupWaveId:string
}){
  if(input.baselineWaveId===input.followupWaveId)
    throw new SurveyAnalyticsError(400,'请选择不同的基线与后测波次')
  return prisma.$transaction(async tx=>{
    const project=await authorized(tx,input.actorUserId,input.projectId)
    if(project.collectionMode!=='LINKED_WAVES')
      throw new SurveyAnalyticsError(409,'单次独立匿名研究不能按个人匹配')
    const waveRows=await tx.surveyWave.findMany({
      where:{projectId:input.projectId,id:{in:[input.baselineWaveId,input.followupWaveId]}},
      select:{id:true},
    })
    if(waveRows.length!==2)throw new SurveyAnalyticsError(404,'研究波次不属于当前项目')
    const rows=await tx.$queryRaw<Array<{participantId:string;waveId:string}>>`
      SELECT a.participant_id AS "participantId",a.wave_id AS "waveId"
      FROM "survey_wave_attempts" a
      JOIN "survey_waves" w ON w.id=a.wave_id AND w.project_id=a.project_id
      JOIN "survey_publications" publication
        ON publication.id=w.publication_id AND publication.project_id=w.project_id
      JOIN "survey_wave_finals" sf
        ON sf.attempt_id=a.id AND sf.project_id=a.project_id AND sf.wave_id=a.wave_id
          AND sf.publication_id=publication.id AND sf.definition_digest=publication.definition_digest
      WHERE a.project_id=${input.projectId}
        AND a.wave_id IN (${Prisma.join([input.baselineWaveId,input.followupWaveId])})
        AND a.participant_id IS NOT NULL AND a.excluded_at IS NULL
        AND a.status='COMPLETED'
    `
    const early=new Set(rows.filter(x=>x.waveId===input.baselineWaveId).map(x=>x.participantId))
    const later=new Set(rows.filter(x=>x.waveId===input.followupWaveId).map(x=>x.participantId))
    const matched=[...early].filter(x=>later.has(x)).length
    return {baselineWaveId:input.baselineWaveId,followupWaveId:input.followupWaveId,
      baselineN:early.size,followupN:later.size,matchedN:matched,
      attritionN:early.size-matched,lateJoinN:later.size-matched,
      note:'仅统计两个波次均具有真实 FINAL 的项目内研究编号，不能解释成因果或独立自然人数。',
    }
  })
}
