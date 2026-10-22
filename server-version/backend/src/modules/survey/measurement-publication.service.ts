import {catalogSnapshotsForDrafts,compileCatalogUnit} from './catalog.service'
import {recheckCatalogScaleSourceExpiry} from './catalog.sources'
import {Prisma} from '@prisma/client'
import {prisma} from '../../config/database'
import {authorizedProject,SurveyBuilderError} from './builder.service'
import {compileFrozenResearchUnit,publishSurveyMeasurementUnit} from './publication.service'
import {assertSurveyMediaOwned} from './media.references'
import {retainAssessmentAssetReferences} from '../assessment-media/assessment-asset'
/** Explicit native or licensed read-only Scale publication; never grants editing. */
export async function publishSurveyMeasurementDraft(actorId:string,projectId:string,draftId:string,revision:number){
  return prisma.$transaction(async tx=>{
    await authorizedProject(tx,actorId,projectId,true)
    const locks=await tx.$queryRaw<Array<{id:string}>>(Prisma.sql`SELECT id FROM survey_instrument_drafts WHERE id=${draftId} AND project_id=${projectId} FOR UPDATE`)
    if(!locks.length)throw new SurveyBuilderError(404,'研究工具不存在')
    const draft=await tx.surveyInstrumentDraft.findUniqueOrThrow({where:{id:draftId}})
    if(draft.revision!==revision||!['DRAFT','PUBLISHED'].includes(draft.status))throw new SurveyBuilderError(409,'研究工具草稿已变化')
    if(draft.catalogGrantId&&draft.kind!=='SCALE')throw new SurveyBuilderError(403,'本入口仅支持目录量表的显式发布')
    if(draft.kind==='FORM')throw new SurveyBuilderError(400,'普通表单不生成测量版本')
    const sources=await catalogSnapshotsForDrafts(tx,actorId,draft.catalogGrantId?[draft.catalogGrantId]:[])
    const unit=draft.catalogGrantId?compileCatalogUnit(draft,sources.get(draft.catalogGrantId)!):compileFrozenResearchUnit(draft)
    const assets=await assertSurveyMediaOwned(tx,actorId,projectId,[{kind:unit.kind,definition:unit.displayDefinition,compiledDefinition:unit.compiledDefinition,sourceProvenance:unit.sourceProvenance}])
    const release=await publishSurveyMeasurementUnit(tx,unit,actorId,projectId)
    if(release.status!=='PUBLISHED')throw new SurveyBuilderError(409,'该草稿版本已停止用于新施测，请编辑后发布新版本')
    await retainAssessmentAssetReferences({owner:{entityType:'MeasurementContentRelease',entityId:release.releaseId,field:'media'},references:assets,db:tx})
    await authorizedProject(tx,actorId,projectId,true)
    await recheckCatalogScaleSourceExpiry(tx,sources.values())
    if(draft.kind==='SCALE'&&!draft.catalogGrantId) await tx.surveyInstrumentDraft.update({where:{id:draftId},data:{
      status:'PUBLISHED',measurementReleaseId:release.releaseId}})
    // The release's immutable publisher/time is the idempotent publication audit.
    return {releaseId:release.releaseId,contentHash:release.contentHash,measurementHash:release.content.measurementHash,
      family:release.family,version:release.version,metricKeys:release.content.metrics.map(m=>m.metricKey)}
  })
}
