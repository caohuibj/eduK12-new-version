import {Prisma} from '@prisma/client'
import {prisma} from '../../config/database'
import {authorizedProject,SurveyBuilderError} from './builder.service'
import {compileFrozenResearchUnit,publishSurveyMeasurementUnit} from './publication.service'
import {assertSurveyMediaOwned} from './media.references'
import {retainAssessmentAssetReferences} from '../assessment-media/assessment-asset'
/** Explicit native content publication before report authoring or administration. */
export async function publishSurveyMeasurementDraft(actorId:string,projectId:string,draftId:string,revision:number){
  return prisma.$transaction(async tx=>{
    await authorizedProject(tx,actorId,projectId,true)
    const locks=await tx.$queryRaw<Array<{id:string}>>(Prisma.sql`SELECT id FROM survey_instrument_drafts WHERE id=${draftId} AND project_id=${projectId} FOR SHARE`)
    if(!locks.length)throw new SurveyBuilderError(404,'研究工具不存在')
    const draft=await tx.surveyInstrumentDraft.findUniqueOrThrow({where:{id:draftId}})
    if(draft.revision!==revision||draft.status!=='DRAFT')throw new SurveyBuilderError(409,'研究工具草稿已变化')
    if(draft.catalogGrantId)throw new SurveyBuilderError(403,'目录来源须沿原授权发布路径使用')
    if(draft.kind==='FORM')throw new SurveyBuilderError(400,'普通表单不生成测量版本')
    const unit=compileFrozenResearchUnit(draft)
    const assets=await assertSurveyMediaOwned(tx,actorId,projectId,[{kind:unit.kind,definition:unit.displayDefinition}])
    const release=await publishSurveyMeasurementUnit(tx,unit,actorId,projectId)
    if(release.status!=='PUBLISHED')throw new SurveyBuilderError(409,'该草稿版本已停止用于新施测，请编辑后发布新版本')
    await retainAssessmentAssetReferences({owner:{entityType:'MeasurementContentRelease',entityId:release.releaseId,field:'media'},references:assets,db:tx})
    // The release's immutable publisher/time is the idempotent publication audit.
    return {releaseId:release.releaseId,contentHash:release.contentHash,measurementHash:release.content.measurementHash,
      family:release.family,version:release.version,metricKeys:release.content.metrics.map(m=>m.metricKey)}
  })
}
