import { z } from 'zod'
import { prisma } from '../../config/database'

const input = z.object({ kind: z.enum(['LEGACY','LEGACY_QUESTIONNAIRE','COLLECTION','QUESTIONNAIRE','LEGACY_COMPOSITE','SCALE','COGNITIVE']), tags: z.array(z.string().trim().min(1).max(20)).max(10), expectedTags: z.array(z.string()).max(10) }).strict()
/** Tags affect discovery only. No publication revision, config or frozen scoring writes. */
export async function updateCatalogTags(actor: {userId:string;role:string}, id: string, raw: unknown) {
  if (!['TEACHER','ADMIN'].includes(actor.role)) throw Object.assign(new Error('无权管理测评标签'),{statusCode:403})
  const value=input.parse(raw), tags=[...new Set(value.tags)], owned=actor.role==='ADMIN'?{}:{[value.kind==='LEGACY'||value.kind==='LEGACY_QUESTIONNAIRE'||value.kind==='SCALE'?'creatorId':'createdBy']:actor.userId}
  const where={id,...owned,tags:{equals:value.expectedTags}}
  const result=value.kind==='LEGACY'||value.kind==='LEGACY_QUESTIONNAIRE'?await prisma.questionnaire.updateMany({where,data:{tags}})
    :value.kind==='SCALE'?await prisma.scale.updateMany({where,data:{tags}})
    :value.kind==='COGNITIVE'?await prisma.cognitiveAssignment.updateMany({where,data:{tags}})
    :await prisma.compositeAssessment.updateMany({where:{...where,productKind:value.kind==='COLLECTION'?'QUESTIONNAIRE':value.kind},data:{tags}})
  if(result.count!==1) throw Object.assign(new Error('标签已变化或无权修改，请刷新列表'),{statusCode:409})
  return {tags}
}
