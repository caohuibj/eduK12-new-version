import { randomUUID, randomInt } from 'node:crypto'
import { canonicalHash } from '../assessment-runtime/canonical'
import { decryptUnifiedRuntimePayload } from '../assessment-runtime/security'
import { planMaterialAllocation } from '../assessment-core/materials/allocation'
import type { FrozenTrainingFlow } from '../assessment-core/flow/training'
import { compositeConflict, compositeForbidden } from './composite.errors'

export type TrainingMaterialAssignment = {
  schemaVersion: 1; claimId: string; experimentId: string; compositeId: string;
  publicationKey: string; configDigest: string; participantKey: string;
  attemptId: string; attemptEpoch: number; groupKey: string; materialDigest: string;
  algorithm: 'CRYPTO_RANDOM_INT_V1'|'CRYPTO_QUOTA_WEIGHTED_V1'|'LINKED_INHERIT_V1';
  assignmentHash: string;
}
const fail=():never=>{throw compositeForbidden('材料分配与冻结身份不一致')}
const materialDigest=(group:{materialTitle:string;materialBody:string})=>canonicalHash({materialTitle:group.materialTitle,materialBody:group.materialBody})
export function assertTrainingMaterialAssignment(value:any,flow:FrozenTrainingFlow,attempt:any,composite:any):TrainingMaterialAssignment {
  if(flow.schemaVersion!==2||!value||value.schemaVersion!==1)fail()
  const {assignmentHash,...body}=value
  const keys=['schemaVersion','claimId','experimentId','compositeId','publicationKey','configDigest','participantKey','attemptId','attemptEpoch','groupKey','materialDigest','algorithm','assignmentHash']
  if(Object.keys(value).length!==keys.length||keys.some(key=>!Object.prototype.hasOwnProperty.call(value,key)))fail()
  if(canonicalHash(body)!==assignmentHash||value.attemptId!==attempt.id||value.attemptEpoch!==attempt.attemptEpoch||value.participantKey!==attempt.participantKey||value.compositeId!==composite.id||value.publicationKey!==new Date(composite.publishedAt).toISOString()||value.configDigest!==flow.flowDigest||typeof value.claimId!=='string'||!value.claimId||typeof value.experimentId!=='string'||!value.experimentId||!['CRYPTO_RANDOM_INT_V1','CRYPTO_QUOTA_WEIGHTED_V1','LINKED_INHERIT_V1'].includes(value.algorithm))fail()
  const group=flow.schemaVersion===2?flow.experiment.groups.find(group=>group.groupKey===value.groupKey):null
  if(!group||materialDigest(group)!==value.materialDigest)fail()
  return value
}
export function materialRestartClaim(parent:any,composite:any):string|undefined {
  if(composite.trainingFlowFrozen?.schemaVersion!==2)return undefined
  if(!parent.trainingFlowSnapshotEncrypted||!parent.trainingFlowSnapshotHash)fail()
  const snapshot=decryptUnifiedRuntimePayload<any>(parent.trainingFlowSnapshotEncrypted)
  if(snapshot.schemaVersion!==2||canonicalHash(snapshot)!==parent.trainingFlowSnapshotHash)fail()
  return assertTrainingMaterialAssignment(snapshot.materialAssignment,composite.trainingFlowFrozen,parent,composite).claimId
}
/** Only called for explicit V2 material admissions, within the caller's parent
 * definition/attempt transaction. Never called by GET, recovery or replay.
 * Lock order: definition -> original attempt (restart) -> candidate grants/assets
 * -> exact experiment -> sorted publication buckets -> subject binding. */
export async function allocateTrainingMaterial(tx:any,attempt:any,composite:any,restartClaimId?:string):Promise<TrainingMaterialAssignment|null> {
  const flow:FrozenTrainingFlow=composite.trainingFlowFrozen
  if(flow?.schemaVersion!==2)return null
  const participantKey=attempt.participantKey,publicationKey=new Date(composite.publishedAt).toISOString()
  const courseId=attempt.deliveryCourseId
  if(!courseId||!participantKey)fail()
  const groupKeysHash=canonicalHash(flow.experiment.groups.map(group=>group.groupKey).sort())
  const id=randomUUID()
  await tx.$executeRaw`INSERT INTO training_material_experiments (id,owner_id,course_id,experiment_key,group_keys_hash) VALUES (${id},${composite.createdBy},${courseId},${flow.experiment.experimentKey},${groupKeysHash}) ON CONFLICT (owner_id,course_id,experiment_key) DO NOTHING`
  const scopes=await tx.$queryRaw`SELECT id,group_keys_hash AS "groupKeysHash" FROM training_material_experiments WHERE owner_id=${composite.createdBy} AND course_id=${courseId} AND experiment_key=${flow.experiment.experimentKey} FOR UPDATE`
  const scope=scopes[0]
  if(scopes.length!==1||scope.groupKeysHash!==groupKeysHash)throw compositeConflict('同一课程实验的组键合同不一致，请使用新的明确实验标识')
  let claim:any
  if(restartClaimId){
    claim=await tx.trainingMaterialAllocationClaim.findUnique({where:{id:restartClaimId}})
    if(!claim||claim.experimentId!==scope.id||claim.compositeId!==composite.id||claim.publicationKey!==publicationKey||claim.configDigest!==flow.flowDigest||claim.participantKey!==participantKey)fail()
  }else{
    let buckets:any[]|undefined
    if(flow.quotaPolicy){
      await tx.trainingMaterialQuotaBucket.createMany({data:flow.experiment.groups.map(group=>({id:randomUUID(),compositeId:composite.id,publicationKey,configDigest:flow.flowDigest,groupKey:group.groupKey,maxAssigned:flow.quotaPolicy!.groupLimits[group.groupKey],assignedCount:0})),skipDuplicates:true})
      buckets=await tx.$queryRaw`SELECT id,group_key AS "groupKey",max_assigned AS "maxAssigned",assigned_count AS "assignedCount" FROM training_material_quota_buckets WHERE composite_id=${composite.id} AND publication_key=${publicationKey} AND config_digest=${flow.flowDigest} ORDER BY group_key FOR UPDATE`
    }
    const linked=flow.experiment.linkedPolicy==='KEEP_LINKED'&&attempt.userId
      ?await tx.trainingMaterialSubjectBinding.findUnique({where:{experimentId_participantKey:{experimentId:scope.id,participantKey}}}):null
    const plan=planMaterialAllocation({experiment:flow.experiment,policy:flow.quotaPolicy,buckets,draw:randomInt,
      ...(linked?{inherited:{groupKey:linked.groupKey,inheritedFromAttemptId:linked.initialClaimId}}:{})},message=>{throw compositeConflict(message)})
    const group=flow.experiment.groups.find(group=>group.groupKey===plan.groupKey)
    if(!group)fail()
    if(plan.quotaBucket){
      const bucket=plan.quotaBucket
      const updated=await tx.trainingMaterialQuotaBucket.updateMany({where:{compositeId:composite.id,publicationKey,configDigest:flow.flowDigest,groupKey:bucket.groupKey,maxAssigned:bucket.maxAssigned,assignedCount:bucket.assignedCount},data:{assignedCount:{increment:1}}})
      if(updated.count!==1)throw compositeConflict('材料组名额正在被领取，请重新进入')
    }
    claim=await tx.trainingMaterialAllocationClaim.create({data:{id:randomUUID(),experimentId:scope.id,compositeId:composite.id,publicationKey,configDigest:flow.flowDigest,participantKey,groupKey:plan.groupKey,algorithm:plan.algorithm,materialDigest:materialDigest(group!),initialAttemptId:attempt.id,inheritedFromClaimId:linked?.initialClaimId??null}})
    if(flow.experiment.linkedPolicy==='KEEP_LINKED'&&attempt.userId&&!linked)await tx.trainingMaterialSubjectBinding.create({data:{id:randomUUID(),experimentId:scope.id,participantKey,groupKey:claim.groupKey,initialClaimId:claim.id}})
  }
  const body={schemaVersion:1 as const,claimId:claim.id,experimentId:scope.id,compositeId:composite.id,publicationKey,configDigest:flow.flowDigest,participantKey,attemptId:attempt.id,attemptEpoch:attempt.attemptEpoch,groupKey:claim.groupKey,materialDigest:claim.materialDigest,algorithm:claim.algorithm}
  return assertTrainingMaterialAssignment({...body,assignmentHash:canonicalHash(body)},flow,attempt,composite)
}
