import {randomUUID} from 'node:crypto'
import {Prisma} from '@prisma/client'
import {prisma} from '../../config/database'
import {SurveyAnalyticsError} from './analytics.read'
import {surveyAttemptCode} from './analytics.export-format'

type Tx=Prisma.TransactionClient
const denied=(message='研究记录不存在或无当前访问资格'):never=>
  {throw new SurveyAnalyticsError(404,message)}
/** Lock project first so a quality change serializes with in-flight exports
 * and voluntary withdrawals. A mutable analysis decision never rewrites FINAL.
 */
async function owner(tx:Tx,userId:string,projectId:string,write:boolean){
  const rows=await tx.$queryRaw<Array<{id:string}>>`
    SELECT p.id FROM survey_projects p
    JOIN users u ON u.id=p.owner_user_id
    JOIN survey_researcher_grants g ON g.user_id=u.id
    JOIN survey_mfa_credentials m ON m.user_id=u.id
    WHERE p.id=${projectId} AND p.owner_user_id=${userId}
      AND u.account_domain='SURVEY' AND u.is_active AND NOT u.is_frozen
      AND (u.expires_at IS NULL OR u.expires_at>statement_timestamp())
      AND g.status='ACTIVE' AND m.enabled
    ${write?Prisma.sql`FOR UPDATE OF p FOR SHARE OF u,g,m`:Prisma.sql`FOR SHARE OF p,u,g,m`}
  `
  if(rows.length!==1)denied()
}
export async function listSampleQuality(actorUserId:string,projectId:string,page:number){
  return prisma.$transaction(async tx=>{
    await owner(tx,actorUserId,projectId,false)
    const records=await tx.surveyWaveAttempt.findMany({
      where:{projectId,status:'COMPLETED',excludedAt:null,final:{isNot:null}},
      take:25,skip:(page-1)*25,
      orderBy:[{completedAt:'desc'},{id:'desc'}],
      select:{id:true,waveId:true,completedAt:true,
        participant:{select:{researchCode:true}},
        sampleReview:{select:{verdict:true,reason:true,revision:true,reviewedAt:true}}},
    })
    return {page,pageSize:25,list:records.map(row=>({
      attemptId:row.id,attemptCode:surveyAttemptCode(row.id),
      researchCode:row.participant?.researchCode??null,
      waveId:row.waveId,completedAt:row.completedAt,
      verdict:row.sampleReview?.verdict??'INCLUDED',
      reason:row.sampleReview?.reason??null,
      revision:row.sampleReview?.revision??0,
      reviewedAt:row.sampleReview?.reviewedAt??null,
    }))}
  })
}
export async function setSampleQuality(input:{
  actorUserId:string;projectId:string;attemptId:string;
  revision:number;verdict:'INCLUDED'|'EXCLUDED';reason:string
}){
  const reason=input.reason.trim()
  if(reason.length<2||reason.length>1000)
    throw new SurveyAnalyticsError(400,'分析纳入/排除理由必须填写 2–1000 字')
  return prisma.$transaction(async tx=>{
    await owner(tx,input.actorUserId,input.projectId,true)
    await tx.$queryRaw`SELECT id FROM survey_wave_attempts
      WHERE id=${input.attemptId} AND project_id=${input.projectId} FOR UPDATE`
    const attempt=await tx.surveyWaveAttempt.findFirst({
      where:{id:input.attemptId,projectId:input.projectId,
        status:'COMPLETED',excludedAt:null,final:{isNot:null}},
      select:{id:true,waveId:true},
    })
    if(!attempt)denied('只可复核本项目未撤回的真实 FINAL')
    const old=await tx.surveySampleReview.findUnique({where:{attemptId:input.attemptId}})
    if((old?.revision??0)!==input.revision)
      throw new SurveyAnalyticsError(409,'分析质量记录已更新，请刷新后重试')
    const revision=input.revision+1
    if(old){
      const changed=await tx.surveySampleReview.updateMany({
        where:{attemptId:input.attemptId,projectId:input.projectId,revision:input.revision},
        data:{verdict:input.verdict,reason,reviewerId:input.actorUserId,
          revision,reviewedAt:new Date()},
      })
      if(changed.count!==1)throw new SurveyAnalyticsError(409,'质量记录发生并发变化')
    }else{
      await tx.surveySampleReview.create({data:{
        attemptId:input.attemptId,projectId:input.projectId,
        waveId:attempt!.waveId,verdict:input.verdict,reason,
        reviewerId:input.actorUserId,revision,
      }})
    }
    // Policy changes invalidate previously prepared but not yet downloaded CSVs.
    await tx.surveyProject.update({where:{id:input.projectId},
      data:{revision:{increment:1}}})
    await tx.surveyExportTicket.updateMany({
      where:{projectId:input.projectId,status:'READY'},data:{status:'REVOKED'},
    })
    await tx.surveyEvent.create({data:{
      id:randomUUID(),actorUserId:input.actorUserId,
      projectId:input.projectId,action:'RESEARCH_SAMPLE_QUALITY_REVIEWED',
      metadata:{attemptId:input.attemptId,waveId:attempt!.waveId,
        previousVerdict:old?.verdict??'INCLUDED',verdict:input.verdict,
        revision,reason},
    }})
    return {attemptId:input.attemptId,verdict:input.verdict,revision,reason}
  })
}

/** Researcher-visible audit trail for one eligible FINAL. Show immutable event
 * history rather than only the latest mutable review row. Never expose it to
 * System Admin, other project owners, or public participants.
 */
export async function listSampleQualityHistory(
  actorUserId:string,projectId:string,attemptId:string,page:number,
){
  return prisma.$transaction(async tx=>{
    await owner(tx,actorUserId,projectId,false)
    const eligible=await tx.surveyWaveAttempt.findFirst({
      where:{id:attemptId,projectId,status:'COMPLETED',excludedAt:null,
        final:{isNot:null}},select:{id:true},
    })
    if(!eligible)denied('质量审计记录不存在或已撤回')
    const events=await tx.surveyEvent.findMany({
      where:{projectId,action:'RESEARCH_SAMPLE_QUALITY_REVIEWED',
        metadata:{path:['attemptId'],equals:attemptId}},
      select:{actorUserId:true,createdAt:true,metadata:true},
      orderBy:[{createdAt:'desc'},{id:'desc'}],
      skip:(page-1)*25,take:25,
    })
    return {attemptCode:surveyAttemptCode(attemptId),page,pageSize:25,
      list:events.map(event=>{
        const data=event.metadata
        if(!data||typeof data!=='object'||Array.isArray(data))
          throw new SurveyAnalyticsError(409,'质量审核日志的结构无效')
        const detail=data as Record<string,unknown>
        if(!['INCLUDED','EXCLUDED'].includes(String(detail.verdict))
          ||!['INCLUDED','EXCLUDED'].includes(String(detail.previousVerdict))
          ||typeof detail.reason!=='string'||!Number.isSafeInteger(detail.revision))
          throw new SurveyAnalyticsError(409,'质量审核日志无法完整核验')
        return {reviewedAt:event.createdAt,reviewerId:event.actorUserId,
          previousVerdict:detail.previousVerdict,verdict:detail.verdict,
          reason:detail.reason,revision:detail.revision}
      })}
  })
}
