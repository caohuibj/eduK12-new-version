import type { MaterialExperiment,MaterialQuotaPolicy } from './definition'

export type MaterialQuotaBucket={groupKey:string;maxAssigned:number;assignedCount:number}
export type MaterialAssignmentAlgorithm='CRYPTO_RANDOM_INT_V1'|'CRYPTO_QUOTA_WEIGHTED_V1'|'LINKED_INHERIT_V1'|'NO_EXPERIMENT'
export type LinkedMaterialAssignment={id:string;schemaVersion:number;experimentKey:string|null;groupKey:string|null}
export type InheritedMaterialAssignment={groupKey:string;inheritedFromAttemptId:string}
export class MaterialAllocationError extends Error{}
const fail=(message:string):never=>{throw new MaterialAllocationError(message)}
/** Inject a cryptographically secure integer source at the entry boundary.
 * Deterministic tests cover exact cumulative intervals rather than frequencies. */
export function chooseMaterialGroup(experiment:MaterialExperiment|undefined,
  draw:(max:number)=>number,reject:(message:string)=>never=fail):string|null{
  if(!experiment)return null
  const total=experiment.groups.reduce((sum,g)=>sum+g.weight,0)
  const selected=draw(total)
  if(!Number.isSafeInteger(selected)||selected<0||selected>=total)
    return reject('实验随机数源超出受控范围')
  let position=selected
  for(const group of experiment.groups){
    if(position<group.weight)return group.groupKey
    position-=group.weight
  }
  return reject('实验分配无法匹配冻结权重')
}
/** Caller supplies historical assignments in its canonical persisted order.
 * No new draw is permitted when the earliest matching linked arm disappears. */
export function findLinkedMaterialAssignment(experiment:MaterialExperiment|undefined,
  prior:Iterable<LinkedMaterialAssignment>,reject:(message:string)=>never=fail):InheritedMaterialAssignment|undefined{
  if(experiment?.linkedPolicy!=='KEEP_LINKED')return undefined
  for(const assignment of prior){
    if(assignment.schemaVersion!==1||assignment.experimentKey!==experiment.experimentKey)continue
    if(!assignment.groupKey||!experiment.groups.some(g=>g.groupKey===assignment.groupKey))
      return reject('保持分组要求沿用此前合法实验组；新波次的组别定义不一致')
    return {groupKey:assignment.groupKey,inheritedFromAttemptId:assignment.id}
  }
  return undefined
}
/** Pure reservation plan. The adapter must hold its exact admission/subject
 * locks and atomically CAS quotaBucket plus the persisted assignment in one
 * transaction. Existing persisted assignment is validated and returned before
 * calling this function: replay never reserves another slot. */
export function planMaterialAllocation(input:{experiment:MaterialExperiment|undefined;
  policy?:MaterialQuotaPolicy;buckets?:readonly MaterialQuotaBucket[];
  inherited?:InheritedMaterialAssignment;draw:(max:number)=>number},
  reject:(message:string)=>never=fail){
  const {experiment,policy,inherited,draw}=input
  let groupKey:string|null=inherited?.groupKey??null
  let quotaBucket:MaterialQuotaBucket|undefined
  if(experiment?.mode==='QUESTIONNAIRE_VARIANTS'&&(policy||experiment.linkedPolicy!=='RERANDOMIZE'))
    return reject('问卷子版本只支持每波次独立概率分配')
  if(policy){
    if(!experiment)return reject('研究条件配额要求冻结的实验定义')
    const buckets=input.buckets??[]
    if(buckets.length!==experiment.groups.length||
      buckets.some(b=>policy.groupLimits[b.groupKey]!==b.maxAssigned))
      return reject('实验配额计数器与冻结发布定义不一致')
    if(groupKey){
      quotaBucket=buckets.find(b=>b.groupKey===groupKey)
      if(!quotaBucket||quotaBucket.assignedCount>=quotaBucket.maxAssigned)
        return reject('既有研究实验组本轮名额已满，不允许随机改变纵向分组')
    }else{
      const candidates=experiment.groups.filter(g=>{
        const b=buckets.find(x=>x.groupKey===g.groupKey)
        return !!b&&b.assignedCount<b.maxAssigned
      })
      if(!candidates.length)return reject('本波次全部实验组名额已用尽')
      groupKey=chooseMaterialGroup({...experiment,groups:candidates},draw,reject)
      quotaBucket=buckets.find(b=>b.groupKey===groupKey)
    }
    if(!quotaBucket)return reject('实验条件配额读取失败')
  }else if(!groupKey)groupKey=chooseMaterialGroup(experiment,draw,reject)
  const algorithm:MaterialAssignmentAlgorithm=inherited?'LINKED_INHERIT_V1':
    experiment?(policy?'CRYPTO_QUOTA_WEIGHTED_V1':'CRYPTO_RANDOM_INT_V1'):'NO_EXPERIMENT'
  return {groupKey,algorithm,...(inherited?{inheritedFromAttemptId:inherited.inheritedFromAttemptId}:{}),
    ...(quotaBucket?{quotaBucket}:{})}
}
