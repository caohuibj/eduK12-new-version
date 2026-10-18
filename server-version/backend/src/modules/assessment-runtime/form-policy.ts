import { z } from 'zod'
import { InstrumentFinalSubmitError } from '../../services/instrumentFinalSubmit'
export const trainingFormPolicySchema = z.object({
  version: z.literal(3),
  requiredRefusal: z.enum(['BLOCK_SUBMIT', 'ALLOW_SUBMIT']),
  hiddenRequired: z.enum(['EXEMPT', 'NOT_SATISFIED']),
}).strict()
export type TrainingFormPolicy = z.infer<typeof trainingFormPolicySchema>
export type TaskSatisfaction = 'SATISFIED' | 'NOT_SATISFIED'
export type FormFactState = 'ANSWERED' | 'REFUSED' | 'SHOWN_MISSING' | 'NOT_SHOWN'
export const readTrainingFormPolicy = (value: unknown): TrainingFormPolicy | null => {
  if (value == null) return null
  const result = trainingFormPolicySchema.safeParse(value)
  if (!result.success) throw new InstrumentFinalSubmitError('FORM_ANSWER_INVALID', 'Training Form V3 策略无效', 400)
  return result.data
}
export const isTaskSatisfied = (attempt: {status: string; taskSatisfaction?: string | null}) =>
  attempt.status === 'COMPLETED' && attempt.taskSatisfaction !== 'NOT_SATISFIED'
/** Exact identity graph remap. Never replace substrings of prompts or option keys. */
export const remapTrainingFormDefinition = (definition: any, keys: ReadonlyMap<string, string>) => {
  if (definition == null) return definition
  const itemKey = keys.get(definition.itemKey)
  const source = definition.displayIf && keys.get(definition.displayIf.itemKey)
  if (!itemKey || (definition.displayIf && !source)) throw new InstrumentFinalSubmitError('FORM_ANSWER_INVALID', '复制的表单引用缺少精确稳定键映射', 400)
  return { ...definition, itemKey, ...(definition.displayIf ? { displayIf: { ...definition.displayIf, itemKey: source } } : {}) }
}
