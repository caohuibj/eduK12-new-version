import { z } from 'zod'
import type { FrozenSurveyFlow } from './flow.definition'
import { surveyKeySchema } from './builder.definition'

export const groupQuotaPolicySchema=z.object({
  schemaVersion:z.literal(1),
  groupLimits:z.record(surveyKeySchema,z.number().int().min(1).max(10000)),
}).strict()
export type SurveyGroupQuotaPolicy=z.infer<typeof groupQuotaPolicySchema>
export const surveyCheckpointPolicySchema=z.object({
  schemaVersion:z.literal(1),enabled:z.literal(true),
  ttlHours:z.number().int().min(1).max(48),
}).strict()
export type SurveyCheckpointPolicy=z.infer<typeof surveyCheckpointPolicySchema>
export class SurveyOperationsDefinitionError extends Error{
  constructor(message:string){super(message)}
}
export const compileGroupQuotaPolicy=(raw:unknown,
  flow:FrozenSurveyFlow|undefined):SurveyGroupQuotaPolicy|undefined=>{
  if(raw===null||raw===undefined)return undefined
  const parsed=groupQuotaPolicySchema.safeParse(raw)
  if(!parsed.success)throw new SurveyOperationsDefinitionError('条件配额配置结构不合法')
  const policy=parsed.data
  if(!flow?.experiment)
    throw new SurveyOperationsDefinitionError('条件配额要求同一冻结 Flow 定义实验分组')
  const codes=Object.keys(policy.groupLimits)
  const groups=flow.experiment.groups.map(g=>g.groupKey)
  if(codes.length!==groups.length||codes.some(code=>!groups.includes(code)))
    throw new SurveyOperationsDefinitionError('每个实验组必须且只能设置一个明确的配额上限')
  return policy
}
export const compileCheckpointPolicy=(raw:unknown):SurveyCheckpointPolicy|undefined=>{
  if(raw===null||raw===undefined)return undefined
  const parsed=surveyCheckpointPolicySchema.safeParse(raw)
  if(!parsed.success)
    throw new SurveyOperationsDefinitionError('Checkpoint 必须显式开启并设置 1–48 小时的保存期限')
  return parsed.data
}
