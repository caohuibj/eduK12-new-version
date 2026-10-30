import {Prisma} from '@prisma/client'
import {z} from 'zod'
import {AdminPermissionError} from '../admin-permissions/service'
import {assertToolEntryPolicy,type StandardCombinationEntryProduct} from '../assessment-governance/tool-entry-policy'
import {cognitiveProfileApprovalReceipt} from './cognitive-profile-approval'
import {loadCognitiveProfileArtifact} from './cognitive-profile-artifact'
import {assertPublishedCognitiveArtifactSource,cognitiveProfilePolicyIdentity} from './cognitive-profile-source'
const id=z.string().guid(),hash=z.string().regex(/^[a-f0-9]{64}$/),profile=z.enum(['experience','standard','research'])
/** Common exact source check only, never recipient or issuer authority. Entry
 * services must validate their own distribution and recipient scopes first. */
export async function readApprovedCognitiveProfileArtifact(tx:Prisma.TransactionClient,configId:string,rawProfile:unknown,artifactHash:string,product:StandardCombinationEntryProduct){
 const selected=profile.parse(rawProfile);id.parse(configId);hash.parse(artifactHash)
 z.enum(['TRAINING','SURVEY','SCHOOL','TEACHER']).parse(product)
 const rows=await tx.$queryRaw<Array<{configuration:unknown;format:string}>>`SELECT DISTINCT metadata->'configuration' AS configuration,
  COALESCE(metadata->>'artifactFormatVersion','1') AS format FROM assessment_management_events
  WHERE action='COGNITIVE_PROFILE_APPROVED' AND resource_id=${configId} AND metadata->>'artifactHash'=${artifactHash} LIMIT 2`
 if(rows.length!==1||rows[0].format!=='2')throw new AdminPermissionError(409,'该精确 profile 尚未完成执行闭包的系统审批')
 const configuration=cognitiveProfileApprovalReceipt.shape.configuration.parse(rows[0].configuration)
 if(configuration.configId!==configId||configuration.profile!==selected)throw new AdminPermissionError(409,'所选 profile 与批准来源不一致')
 const artifact=await loadCognitiveProfileArtifact(artifactHash,configuration)
 await assertPublishedCognitiveArtifactSource(tx,artifact)
 const policy=await assertToolEntryPolicy(tx,cognitiveProfilePolicyIdentity(configId,selected,artifactHash),product)
 return {artifact,policy}
}
