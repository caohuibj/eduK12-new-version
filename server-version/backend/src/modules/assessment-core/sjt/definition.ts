import { z } from 'zod'
import { assessmentKeySchema as key, assessmentImageSchema } from '../definition-primitives'
const label = z.string().trim().max(2000)
const note = z.string().trim().max(16000)
export const sjtDraftV1Schema=z.object({
  schemaVersion:z.literal(1),
  respondentType:z.enum(['student_self_report','teacher_self_report']),
  scenarioKey:key, title:label,stimulus:note,
  image:assessmentImageSchema.optional(),
  author:label,
  sourceNote:label,
  licenseStatus:z.enum(['self_authored','authorized','unknown']).optional(),
  redistribution:z.enum(['allowed','restricted','unknown']),
  metrics:z.array(z.object({
    metricKey:key,label,direction:z.literal('descriptive'),
  }).strict()).max(20),
  questions:z.array(z.object({
    questionKey:key,prompt:note,
    responseType:z.enum(['SINGLE','MULTIPLE']).optional(),
    aggregationPolicy:z.enum(['SUM','MEAN']).optional(),
    minSelections:z.number().int().min(1).max(6).optional(),
    maxSelections:z.number().int().min(1).max(6).optional(),
    options:z.array(z.object({
      optionKey:key,label,
      contributions:z.record(key,z.number().finite().min(-100000).max(100000)),
    }).strict()).max(12),
  }).strict()).max(5),
}).strict()
/** V1 remains a named historical contract; new work uses AnySjtDraft. */
export type SjtDraft=z.infer<typeof sjtDraftV1Schema>
export const SJT_V2_LIMITS={scenes:20,questionsPerScene:10,questions:100,metrics:20,
  singleOptions:12,multipleOptions:6,derivedChoices:24,scoredCells:16000} as const
export const sjtQuestionV2Schema=z.object({
  questionKey:key,prompt:note,responseType:z.enum(['SINGLE','MULTIPLE']),
  required:z.boolean(),allowRefusal:z.boolean(),
  aggregationPolicy:z.enum(['SUM','MEAN']).optional(),
  minSelections:z.number().int().min(1).max(6).optional(),
  maxSelections:z.number().int().min(1).max(6).optional(),
  exclusiveOptionKeys:z.array(key).max(12).optional(),
  options:z.array(z.object({
    optionKey:key,label,
    contributions:z.record(key,z.number().finite().min(-100000).max(100000)),
    nonanswerReason:z.enum(['DECLINED','UNABLE_TO_JUDGE']).optional(),
  }).strict()).max(SJT_V2_LIMITS.singleOptions),
}).strict()
export const sjtDraftV2Schema=z.object({
  schemaVersion:z.literal(2),
  respondentType:z.enum(['participant_self_report','student_self_report','teacher_self_report']),
  title:label,author:label,sourceNote:label,
  licenseStatus:z.enum(['self_authored','authorized','unknown']),
  redistribution:z.enum(['allowed','restricted','unknown']),orderPolicy:z.literal('FIXED'),
  metrics:z.array(z.object({metricKey:key,label,direction:z.literal('descriptive')}).strict())
    .max(SJT_V2_LIMITS.metrics),
  scoring:z.object({modelKey:z.enum(['AUTHOR_KEY_SUM','EXPERT_KEY']),
    modelVersion:z.literal('1'),sourceNote:note}).strict(),
  scenes:z.array(z.object({sceneKey:key,title:label,stimulus:note,image:assessmentImageSchema.optional(),
    questions:z.array(sjtQuestionV2Schema).max(SJT_V2_LIMITS.questionsPerScene),
  }).strict()).max(SJT_V2_LIMITS.scenes),
}).strict()
export type SjtDraftV2=z.infer<typeof sjtDraftV2Schema>
export type SjtQuestionV2=z.infer<typeof sjtQuestionV2Schema>
export const sjtDraftSchema=z.discriminatedUnion('schemaVersion',[sjtDraftV1Schema,sjtDraftV2Schema])
export type AnySjtDraft=SjtDraft|SjtDraftV2
export type Issue={path:string;message:string;severity:'error'|'warning'}
export class SjtDraftError extends Error {
 constructor(readonly issues:Issue[]){super('研究工具尚有需修正的字段');this.name='SurveyDraftError'}
}
