import { canonicalHash } from '../assessment-runtime/canonical'
import { Prisma } from '@prisma/client'
import { prisma } from '../../config/database'
import { assertContentAuthority } from '../measurement-content/content-authority.repository'
import { ScaleCopyError } from './scale-copy.service'
export const publicScaleScope=(id:string)=>({product:'TRAINING' as const,scopeKind:'PLATFORM' as const,
  scopeId:'scale-public-delivery',resourceKind:'material' as const,resourceKeys:[id]})
/** PUBLIC is distribution authority, not authorship or library approval. */
export async function setScalePublicDelivery(actorId:string,id:string,grantId:string,enabled:boolean){
  return prisma.$transaction(async tx=>{
    await tx.$queryRaw`SELECT id FROM scales WHERE id=${id} FOR UPDATE`
    const scale=await tx.scale.findUnique({where:{id}})
    if(!scale||scale.status!=='PUBLISHED')throw new ScaleCopyError('仅已发布量表可以设置平台投放',409)
    if(scale.libraryEntryId)throw new ScaleCopyError('共用库授权引用只能按公共库授权投放，不能独立设为 PUBLIC',403)
    await assertContentAuthority(tx,{actorId,grantId,capability:'material.distribute',scope:publicScaleScope(id)})
    const proof={schemaVersion:1,action:'PLATFORM_DISTRIBUTION',scaleId:id,grantId,enabled,previousVisibility:scale.visibility,legacyCompatibilityClosed:scale.legacyPublicAccess}
    await tx.scalePublicationAudit.create({data:{scaleId:id,actorUserId:actorId,proofHash:canonicalHash(proof),proof}})
    return tx.scale.update({where:{id},data:{visibility:enabled?'PUBLIC':'HIDDEN',legacyPublicAccess:false,
      publicDistributionGrantId:enabled?grantId:null}})
  },{isolationLevel:Prisma.TransactionIsolationLevel.ReadCommitted})
}
