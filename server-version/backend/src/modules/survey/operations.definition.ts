import { z } from 'zod'
import type { FrozenSurveyFlow } from './flow.definition'
import { groupQuotaPolicySchema,compileMaterialQuotaPolicy,type MaterialQuotaPolicy } from '../assessment-core/materials/definition'
export { groupQuotaPolicySchema }
export type SurveyGroupQuotaPolicy=MaterialQuotaPolicy
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
  return compileMaterialQuotaPolicy(raw,flow?.experiment,message=>{throw new SurveyOperationsDefinitionError(message)})
}
export const compileCheckpointPolicy=(raw:unknown):SurveyCheckpointPolicy|undefined=>{
  if(raw===null||raw===undefined)return undefined
  const parsed=surveyCheckpointPolicySchema.safeParse(raw)
  if(!parsed.success)
    throw new SurveyOperationsDefinitionError('Checkpoint 必须显式开启并设置 1–48 小时的保存期限')
  return parsed.data
}
