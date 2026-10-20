import { Prisma } from '@prisma/client'
import { canonicalHash } from '../assessment-runtime/canonical'
import { freezeGroupIpPolicy, resolveGroupIpOpenWindow, isGroupIpWindowActive, GroupIpPolicyError } from '../survey/group-ip-policy'
import { compositeBadRequest, compositeForbidden } from './composite.errors'

export type TrainingRoundInput={groupIpPolicy?:unknown;roundId?:string}
export const trainingRoundSelect={id:true,opensAt:true,closesAt:true} as const
export const publicRoundMetadata=(record:{trainingRoundId?:string|null;trainingRound?:{opensAt:Date;closesAt:Date}|null})=>({
  roundId:record.trainingRoundId??null,
  groupIpWindow:record.trainingRound?{opensAt:record.trainingRound.opensAt,closesAt:record.trainingRound.closesAt}:null,
})
export function trainingRoundPublicationIdentity(row:any,courseId:string){
  return {schemaVersion:1,compositeId:row.id,courseId,publishedAt:new Date(row.publishedAt).toISOString(),
    productKind:row.productKind,questionnaireType:row.questionnaireType,
    trainingFlowDigest:row.trainingFlowDigest??null,trainingVariantDigest:row.trainingVariantDigest??null}
}
export async function prepareTrainingPublicRound(tx:Prisma.TransactionClient,row:any,userId:string,input:TrainingRoundInput,expiry:Date,now=new Date()){
  if(input.groupIpPolicy===undefined&&!input.roundId)return null
  if(input.groupIpPolicy!==undefined&&input.roundId)throw compositeBadRequest('请选择新建集中采集轮次或已有轮次')
  const courses=row.questionnaireCourses??[]
  if(row.productKind!=='QUESTIONNAIRE'||row.questionnaireType!=='COURSE'||!row.publicEnabled||row.status!=='PUBLISHED'||!row.publishedAt||courses.length!==1)
    throw compositeBadRequest('集中采集须绑定一个已发布的公开 Training 课程问卷')
  const courseId=courses[0].courseId
  const facts=await tx.$queryRaw<Array<{id:string;endedAt:Date|null}>>`SELECT c.id,c.ended_at AS "endedAt" FROM courses c JOIN users u ON u.id=${row.createdBy}
    WHERE c.id=${courseId} AND c.course_type='TRAINING_COURSE' AND NOT c.is_library
    AND (u.role::text='ADMIN' OR (u.role::text='TEACHER' AND c.creator_id=u.id))
    FOR SHARE OF c,u`
  if(facts.length!==1)throw compositeForbidden('集中采集课程或编制者权限无效')
  if(facts[0].endedAt&&expiry>new Date(facts[0].endedAt))throw compositeBadRequest('集中采集不能超过课程截止时间')
  const studies=await tx.$queryRaw<Array<{id:string}>>`SELECT w.id FROM anonymous_study_waves w
    JOIN composite_assessment_access_tokens t ON t.id=w.access_token_id WHERE t.composite_assessment_id=${row.id} LIMIT 1`
  if(studies.length)throw compositeBadRequest('集中采集暂不能组合匿名研究波次')
  const publicationIdentity=trainingRoundPublicationIdentity(row,courseId),publicationHash=canonicalHash(publicationIdentity)
  if(input.roundId){
    const round=await tx.trainingPublicRound.findUnique({where:{id:input.roundId}})
    if(!round||round.compositeId!==row.id||round.courseId!==courseId||round.publicationHash!==publicationHash)
      throw compositeForbidden('集中采集轮次与当前课程发布不匹配')
    assertTrainingRoundActive(round,now)
    if(expiry>round.closesAt)throw compositeBadRequest('新链接不能延长已冻结轮次')
    return round
  }
  try{
    const policy=freezeGroupIpPolicy(input.groupIpPolicy,now)
    if(!policy)throw compositeBadRequest('集中采集必须显式启用')
    if(row.opensAt&&new Date(row.opensAt)>now)throw compositeBadRequest('综合测评尚未开始，不能提前开启集中采集')
    if(row.expiresAt&&expiry>new Date(row.expiresAt))throw compositeBadRequest('集中采集不能超过综合测评截止时间')
    const window=resolveGroupIpOpenWindow(policy,{closesAt:expiry,finishUntil:expiry},now)!
    return await tx.trainingPublicRound.create({data:{compositeId:row.id,courseId,createdBy:userId,publishedAt:row.publishedAt,
      publicationHash,publicationIdentity,groupIpPolicy:policy,opensAt:window.opensAt,closesAt:window.closesAt}})
  }catch(error){if(error instanceof GroupIpPolicyError)throw compositeBadRequest(error.message);throw error}
}
export function assertTrainingRoundActive(round:any,now=new Date()):void{
  if(!isGroupIpWindowActive({groupIpPolicy:round.groupIpPolicy,groupIpActivatedAt:round.opensAt,
    opensAt:round.opensAt,closesAt:round.closesAt,finishUntil:round.closesAt},now))throw compositeForbidden('集中采集窗口已结束或冻结设置无效')
}
/** New admission only. Recovery/final/report authorization never calls this. */
export async function assertTrainingTokenRound(tx:Prisma.TransactionClient,token:{trainingRoundId?:string|null;compositeAssessmentId:string},now=new Date()){
  if(!token.trainingRoundId)return
  const rounds=await tx.$queryRaw<Array<{courseId:string;groupIpPolicy:unknown;opensAt:Date;closesAt:Date}>>`SELECT
    r.course_id AS "courseId",r.group_ip_policy AS "groupIpPolicy",r.opens_at AS "opensAt",r.closes_at AS "closesAt"
    FROM training_public_rounds r JOIN composite_assessments a ON a.id=r.composite_id AND a.published_at=r.published_at
    JOIN courses c ON c.id=r.course_id
    WHERE r.id=${token.trainingRoundId} AND r.composite_id=${token.compositeAssessmentId}
    AND a.status::text='PUBLISHED' AND a.public_enabled
    AND (a.opens_at IS NULL OR a.opens_at<=${now}) AND (a.expires_at IS NULL OR a.expires_at>${now})
    AND (c.ended_at IS NULL OR c.ended_at>${now}) LIMIT 1`
  if(rounds.length!==1)throw compositeForbidden('集中采集轮次绑定或课程期限无效')
  assertTrainingRoundActive(rounds[0],now)
  return rounds[0].courseId
}
