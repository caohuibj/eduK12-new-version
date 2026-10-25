import {Prisma} from '@prisma/client'
import {prisma} from '../../config/database'
import {freezeTrainingStandardReference} from '../composite/training-standard-combination'

/** Authenticated Training source preflight only. Explicit source-use permission
 * is checked by the domain resolver; this never saves a draft or opens delivery. */
export async function previewTrainingStandardSource(actor:{userId:string},compositeId:string,raw:unknown){
  return prisma.$transaction(async tx=>({
    ...await freezeTrainingStandardReference(tx,actor.userId,compositeId,raw),
    persisted:false as const,publicationReady:false as const,
    reason:'精确版本引用已核对；尚未选入问卷或开放采集',
  }),{isolationLevel:Prisma.TransactionIsolationLevel.ReadCommitted,maxWait:5000,timeout:10000})
}
