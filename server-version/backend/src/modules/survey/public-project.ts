import { prisma } from '../../config/database'
import { SurveyWaveError } from './waves.service'

/** Internal-only lookup for a public project slug, never exposed as raw ID. */
export async function resolveSurveyPublicId(publicId:string):Promise<string>{
  const p=await prisma.surveyProject.findFirst({where:{publicId},select:{id:true}})
  if(!p)throw new SurveyWaveError(403,'研究入口无效')
  return p.id
}
