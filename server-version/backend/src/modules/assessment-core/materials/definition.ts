import { z } from 'zod'
import { assessmentKeySchema as key } from '../definition-primitives'
import { checkFlowText,strictFlowKeys,flowError,type FlowStaticData } from '../flow/compiler'
import type { FlowCompileIssue } from '../flow/definition'

const text=z.string().trim().max(8000)
const materialGroupSchema=z.object({
  groupKey:key,weight:z.number().int().min(1).max(100),
  materialTitle:text,materialBody:text,
}).strict()
/** Materials and instrument-subset variants are separate concepts. The latter
 * extension exists only to preserve the established Survey wire contract. */
export const materialOnlyExperimentSchema=z.object({
  experimentKey:key,linkedPolicy:z.enum(['KEEP_LINKED','RERANDOMIZE']),
  groups:z.array(materialGroupSchema).min(2).max(8),
}).strict()
export const materialExperimentSchema=z.object({
  experimentKey:key,linkedPolicy:z.enum(['KEEP_LINKED','RERANDOMIZE']),
  mode:z.literal('QUESTIONNAIRE_VARIANTS').optional(),
  groups:z.array(materialGroupSchema.extend({
    variantLabel:z.string().trim().min(1).max(200).optional(),
    instrumentKeys:z.array(key).min(1).max(30).optional(),
  }).strict()).min(2).max(8),
}).strict()
export type MaterialExperiment=z.infer<typeof materialExperimentSchema>
export type MaterialOnlyExperiment=z.infer<typeof materialOnlyExperimentSchema>
export const groupQuotaPolicySchema=z.object({
  schemaVersion:z.literal(1),groupLimits:z.record(key,z.number().int().min(1).max(10000)),
}).strict()
export type MaterialQuotaPolicy=z.infer<typeof groupQuotaPolicySchema>
export class MaterialDefinitionError extends Error{}
const fail=(message:string):never=>{throw new MaterialDefinitionError(message)}
export function compileMaterialQuotaPolicy(raw:unknown,experiment:MaterialExperiment|undefined,
  reject:(message:string)=>never=fail):MaterialQuotaPolicy|undefined{
  if(raw===null||raw===undefined)return undefined
  const parsed=groupQuotaPolicySchema.safeParse(raw)
  if(!parsed.success)return reject('条件配额配置结构不合法')
  const policy=parsed.data
  if(!experiment)return reject('条件配额要求同一冻结 Flow 定义实验分组')
  if(experiment.mode==='QUESTIONNAIRE_VARIANTS')
    return reject('问卷子版本使用独立概率分配，不支持条件配额或保证人数')
  const codes=Object.keys(policy.groupLimits),groups=experiment.groups.map(g=>g.groupKey)
  if(codes.length!==groups.length||codes.some(code=>!groups.includes(code)))
    return reject('每个实验组必须且只能设置一个明确的配额上限')
  return policy
}
/** Appends issues in the historical Survey order. Entry adapters own identity
 * vocabulary and decide whether this subject has a durable linked identity. */
export function validateMaterialExperiment(experiment:MaterialExperiment|undefined,
  input:{linked:boolean;staticVars?:Map<string,FlowStaticData>},issues:FlowCompileIssue[]){
  if(!experiment)return
  strictFlowKeys(experiment.groups.map(g=>g.groupKey),'flow.experiment.groups',issues)
  if(experiment.linkedPolicy==='KEEP_LINKED'&&!input.linked)
    flowError(issues,'flow.experiment.linkedPolicy','不关联匿名研究不能保持跨波次分组')
  if(experiment.groups.reduce((n,g)=>n+g.weight,0)>800)
    flowError(issues,'flow.experiment.groups','实验随机权重总和超限')
  if(experiment.mode!=='QUESTIONNAIRE_VARIANTS'&&!experiment.groups.every(g=>g.materialTitle.trim()&&g.materialBody.trim()))
    flowError(issues,'flow.experiment.groups','各实验组必须提供完整展示材料')
  const vars=input.staticVars??new Map<string,FlowStaticData>()
  experiment.groups.forEach((g,i)=>{
    checkFlowText(g.materialTitle,vars,'flow.experiment.groups.'+i+'.materialTitle',issues)
    checkFlowText(g.materialBody,vars,'flow.experiment.groups.'+i+'.materialBody',issues)
  })
}
export const groupHasMaterial=(group:{materialTitle:string;materialBody:string})=>
  !!(group.materialTitle.trim()||group.materialBody.trim())
/** Select only the persisted group's material. Never expose the other groups. */
export function assignedMaterial(experiment:MaterialExperiment|undefined,groupKey:string|null,
  render:(source:string)=>string=source=>source){
  const group=experiment?.groups.find(g=>g.groupKey===groupKey)
  return group&&groupHasMaterial(group)?{blockKey:'assigned_material' as const,
    title:render(group.materialTitle),body:render(group.materialBody)}:undefined
}
