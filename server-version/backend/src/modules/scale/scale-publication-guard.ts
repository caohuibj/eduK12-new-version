import type { Prisma,UserRole } from '@prisma/client'
import { ScaleLibraryError } from '../scale-library-governance/contracts'
import { canUseScale } from '../../services/materialGrant'
import { assertTrainingScaleCollectionAllowed } from './scale-collection-guard'
/** New publication must revalidate exact source rights while holding its write transaction. */
export async function assertScalePublicationRights(tx:Prisma.TransactionClient,actorId:string,role:UserRole|string,ids:string[]){
  const scaleIds=[...new Set(ids)].sort()
  if(!scaleIds.length)return
  await assertTrainingScaleCollectionAllowed(tx,scaleIds)
  const scales=await tx.scale.findMany({where:{id:{in:scaleIds}}})
  if(scales.length!==scaleIds.length)throw new ScaleLibraryError(409,'发布包含不存在的量表')
  for(const scale of scales){
    if(scale.status!=='PUBLISHED'||!await canUseScale(actorId,role,scale,tx))throw new ScaleLibraryError(403,'发布所需的量表使用授权已失效')
  }
}
