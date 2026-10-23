import {verifiedSurveyAttempt} from './admission.service'
import {prisma} from '../../config/database'
import {materialListSchema} from '../assessment-media/material'
import {authorizedSurveyMediaSnapshot} from './public-scale-media'
import {readGeneralForOwnAttempt} from './final.service'
import {SurveyMediaError} from './media.references'

export async function authorizeSurveyMaterial(input:Parameters<typeof authorizedSurveyMediaSnapshot>[0],assetId:string,purpose:'materials'|'report-materials'){
  if(purpose==='materials'){
    const {own,selected}=await authorizedSurveyMediaSnapshot(input)
    const reference=selected.units.flatMap(unit=>materialListSchema.optional().parse((unit.displayDefinition as {materials?:unknown}).materials)??[]).find(item=>item.asset.assetId===assetId)?.asset
    if(reference&&await prisma.assetReference.findFirst({where:{assetId,entityType:'SurveyResearchPublication',entityId:own.publicationId,field:'media'},select:{id:true}}))return reference
  }else{
    // This is the same disclosure function as the report itself, including release timing.
    const report=await readGeneralForOwnAttempt(input)
    const measurements='measurements' in report?report.measurements:[]
    const reference=measurements.flatMap(measurement=>'rawScoreFeedback' in measurement?(measurement.rawScoreFeedback??[]).flatMap(feedback=>feedback.materials??[]):[]).find(item=>item.asset.assetId===assetId)?.asset
    if(reference){
      const own=await verifiedSurveyAttempt(input)
      if(await prisma.assetReference.findFirst({where:{assetId,entityType:'SurveyResearchPublication',entityId:own.publicationId,field:'media'},select:{id:true}}))return reference
    }
  }
  throw new SurveyMediaError(404,'素材不可用')
}
