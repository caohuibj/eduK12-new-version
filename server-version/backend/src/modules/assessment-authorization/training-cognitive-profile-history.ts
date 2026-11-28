import type { Prisma } from '@prisma/client'

export const TRAINING_COGNITIVE_USE_ACTION='TRAINING_COGNITIVE_PROFILE_USE_GRANTED'

export async function hasTrainingCognitiveProfileHistory(tx:Pick<Prisma.TransactionClient,'$queryRaw'>,userId:string,configId:string){
 const rows=await tx.$queryRaw<Array<{id:string}>>`SELECT id FROM assessment_management_events
  WHERE action=${TRAINING_COGNITIVE_USE_ACTION} AND resource_id=${configId} AND metadata->>'userId'=${userId} LIMIT 1`
 return rows.length>0
}
