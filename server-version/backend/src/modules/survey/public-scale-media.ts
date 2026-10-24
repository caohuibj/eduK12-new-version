import {surveyImageRefs} from './media.references'
import {prisma} from '../../config/database'
import {canonicalHash} from '../assessment-runtime/canonical'
import {scaleDefinitionSchema,type ScaleItemDefinition} from '../scale/scale-definition'
import {issueFrozenAssessmentVideoCapabilities} from '../assessment-media/assessment-media-capability'
import {verifiedSurveyAttempt} from './admission.service'
import {ensureSurveyFlowAssignment,assignedSurveySnapshot} from './flow.assignment'
import {isCatalogScalePresentation} from './catalog-scale.presentation'
import type {ResearchFrozenPublication,ResearchFrozenUnit} from './publication.service'
import {SurveyWaveError} from './waves.service'

export type SurveyMediaProof={publicId:string;attemptId:string;researchCode?:string;accessCredential:string}
const missing=():never=>{throw new SurveyWaveError(404,'研究题目媒体不可访问')}
/** Same proof and persisted assignment as the task projection, never a live
 * author definition, library preview entitlement, or a submitted client asset. */
export async function authorizedSurveyMediaSnapshot(input:SurveyMediaProof){
  const own=await verifiedSurveyAttempt(input)
  if(!['STARTED','COMPLETED'].includes(own.status))missing()
  const assignment=own.compiledSnapshot.flow?await prisma.$transaction(tx=>ensureSurveyFlowAssignment(tx,{
    projectId:own.projectId,waveId:own.waveId,attemptId:own.attemptId,participantId:own.participantId,
    researchCode:input.researchCode,accessCredential:input.accessCredential,snapshot:own.compiledSnapshot,
  })):null
  return {own,selected:assignedSurveySnapshot(own.compiledSnapshot,assignment)}
}
/** Item mapping AND the public display identity must agree with canonical
 * content. Report images, other units and omitted items never join this list. */
export function frozenSurveyScaleMediaItems(unit:ResearchFrozenUnit):Array<{itemKey:string;item:ScaleItemDefinition}>{
  if(unit.kind!=='SCALE'||!isCatalogScalePresentation(unit.displayDefinition))return []
  const display=unit.displayDefinition,mapping=unit.sourceAnswerMapping
  if(mapping?.type!=='SCALE_TYPED_V1')missing()
  const definition=scaleDefinitionSchema.parse(unit.compiledDefinition)
  const seen=new Set<string>()
  return display.items.map(shown=>{
    const itemCode=mapping!.items[shown.itemKey]
    const item=definition.items.find(i=>i.itemCode===itemCode)
    if(!item||seen.has(itemCode)||canonicalHash(shown.images??[])!==canonicalHash(item.images??[])||
      canonicalHash(shown.video??null)!==canonicalHash(item.video??null))missing()
    seen.add(itemCode)
    return {itemKey:shown.itemKey,item:item!}
  })
}
export function frozenSurveyScaleImage(snapshot:ResearchFrozenPublication,assetId:string){
  return snapshot.units.flatMap(unit=>frozenSurveyScaleMediaItems(unit).flatMap(({item})=>item.images??[]))
    .find(image=>image.asset.assetId===assetId)?.asset
}
export async function issueOwnSurveyScaleVideo(input:SurveyMediaProof,instrumentKey:string,itemKey:string){
  const {own,selected}=await authorizedSurveyMediaSnapshot(input)
  const unit=selected.units.find(candidate=>candidate.kind==='SCALE'&&candidate.instrumentKey===instrumentKey)
  if(!unit)missing()
  const presentation=frozenSurveyScaleMediaItems(unit!).find(item=>item.itemKey===itemKey)?.item.video
  if(!presentation)missing()
  return issueFrozenAssessmentVideoCapabilities({
    scopeId:`SURVEY:${own.publicationId}:${own.attemptId}:${instrumentKey}:${itemKey}`,
    audience:'public',presentation:presentation!,
    retentionOwner:{entityType:'SurveyResearchPublication',entityId:own.publicationId,field:'media'},db:prisma,
  })
}

/** Shared image route authorization. Native Survey images retain their existing
 * frozen-definition policy; imported sources additionally need publication pins. */
export async function authorizeOwnSurveyImage(input:SurveyMediaProof,assetId:string){
  const {own,selected}=await authorizedSurveyMediaSnapshot(input)
  const refs=surveyImageRefs(selected.units.map(unit=>({kind:unit.kind,definition:unit.displayDefinition})))
  const scaleReference=frozenSurveyScaleImage(selected,assetId)
  const reference=refs.find(image=>image.asset.assetId===assetId)?.asset??scaleReference
  if(!reference)missing()
  const catalogSjtReference=selected.units.some(unit=>unit.kind==='SJT'&&unit.sourceProvenance
    &&surveyImageRefs([{kind:unit.kind,definition:unit.displayDefinition}]).some(image=>image.asset.assetId===assetId))
  if((scaleReference||catalogSjtReference)&&!await prisma.assetReference.findFirst({where:{assetId,
    entityType:'SurveyResearchPublication',entityId:own.publicationId,field:'media'},select:{id:true}}))missing()
  return reference!
}
