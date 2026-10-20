import {z} from 'zod'
import {Prisma} from '@prisma/client'
import {prisma} from '../../config/database'
import type {AdminSessionProof} from '../admin-permissions/proof'
import {lockCurrentContentSystemActor,recheckContentSystemActorAfterWait} from '../measurement-content/admin-authority.service'
import {assertContentAuthority} from '../measurement-content/content-authority.repository'
import {sourceIdentitySchema} from './onboarding/schema'
import {ensureStaticSjtRegistryMapping,validateStaticSjtRegistryMapping,publishStaticSjtMeasurement,staticSjtDeploymentSchema} from './static-measurement-release'
const options={isolationLevel:Prisma.TransactionIsolationLevel.ReadCommitted,maxWait:5000,timeout:10000}
const publishInput=z.object({mappingId:z.string().uuid(),grantId:z.string().uuid(),deployment:staticSjtDeploymentSchema}).strict()
/** Explicit registry preparation creates only an immutable source mapping, never
 * a license, capability, business identity or content release. */
export async function prepareAdminStaticSjtMapping(actorId:string,proof:AdminSessionProof,raw:unknown){
 const identity=sourceIdentitySchema.parse(raw)
 return prisma.$transaction(async tx=>{
  const mapping=await ensureStaticSjtRegistryMapping(tx,identity)
  const {users}=await lockCurrentContentSystemActor(tx,actorId,proof)
  await recheckContentSystemActorAfterWait(tx,proof,users)
  return {mappingId:mapping.id,...identity,contentDigest:mapping.content_digest,measurementReleaseId:mapping.measurement_release_id}
 },options)
}
/** Reuses unified strong authentication; administrator status never substitutes
 * for an exact current content capability or the separate source license. */
export async function publishAdminStaticSjtMeasurement(actorId:string,proof:AdminSessionProof,raw:unknown){
 const input=publishInput.parse(raw)
 return prisma.$transaction(async tx=>{
  await validateStaticSjtRegistryMapping(tx,input.mappingId,'PUBLISH')
  const {users}=await lockCurrentContentSystemActor(tx,actorId,proof)
  const authority={actorId,grantId:input.grantId,capability:'measurement.publish' as const,
   scope:{product:'TRAINING' as const,scopeKind:'PLATFORM' as const,scopeId:'situational-registry',resourceKind:'measurement' as const,resourceKeys:[input.mappingId]}}
  await assertContentAuthority(tx,authority)
  const result=await publishStaticSjtMeasurement(tx,{actorId,mappingId:input.mappingId,deployment:input.deployment})
  // Locks prevent revocation races; elapsed validity is still checked after waits.
  await assertContentAuthority(tx,authority)
  await recheckContentSystemActorAfterWait(tx,proof,users)
  return {mappingId:result.mapping.id,measurementReleaseId:result.release.releaseId,contentHash:result.release.contentHash,status:result.release.status}
 },options)
}
