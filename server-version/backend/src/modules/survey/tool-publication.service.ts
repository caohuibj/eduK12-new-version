import {prisma} from '../../config/database'
import {retainAssessmentAssetReferences} from '../assessment-media/assessment-asset'
import {publishScaleMeasurement,surveyScaleReleaseContext} from '../measurement-content/scale'
import {authorizeToolOwner,ownedTemplate} from './tool-library.service'
import {SurveyBuilderError} from './builder.service'
import {compileFrozenResearchUnit} from './publication.service'
import {assertSurveyMediaOwned} from './media.references'

/** An explicit private snapshot for library review, independent of any study.
 * Editing/archiving the template never mutates its published versions. */
export async function publishToolMeasurement(actorId:string,templateId:string,revision:number){
  return prisma.$transaction(async tx=>{
    await authorizeToolOwner(tx,actorId)
    const row=await ownedTemplate(tx,actorId,templateId,true)
    if(row.status!=='DRAFT'||row.revision!==revision)throw new SurveyBuilderError(409,'工具状态或修订已变化，请重新读取后发布')
    if(row.kind!=='SCALE')throw new SurveyBuilderError(400,'目前仅自建量表支持共用库申请；表单和组合问卷的审核流程尚未开放')
    const unit=compileFrozenResearchUnit({id:row.id,instrumentKey:'library_tool',kind:row.kind,title:row.title,revision:row.revision,definition:row.definition})
    const references=await assertSurveyMediaOwned(tx,actorId,row.id,[{kind:unit.kind,definition:unit.displayDefinition,compiledDefinition:unit.compiledDefinition}],true)
    const release=await publishScaleMeasurement(tx,{localId:row.id,version:String(row.revision),...surveyScaleReleaseContext(unit),
      definition:unit.compiledDefinition,instrumentClass:'CUSTOM_DESCRIPTIVE',
      scope:{kind:'PRIVATE',ownerId:actorId,product:'SURVEY',resourceId:row.id},
      provenance:{authoringSource:'SURVEY_TOOL_TEMPLATE',authoringSnapshot:{title:row.title,definition:unit.displayDefinition,instrumentClass:'CUSTOM_DESCRIPTIVE',product:'SURVEY'}}},actorId)
    if(release.status!=='PUBLISHED')throw new SurveyBuilderError(409,'该修订的发布版本已停用，请编辑并保存新修订后发布')
    await retainAssessmentAssetReferences({owner:{entityType:'MeasurementContentRelease',entityId:release.releaseId,field:'media'},references,db:tx})
    await authorizeToolOwner(tx,actorId)
    return {releaseId:release.releaseId,version:release.version,contentHash:release.contentHash,revision:row.revision}
  })
}
