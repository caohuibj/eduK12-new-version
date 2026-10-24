import { z } from 'zod'
import { deviceInputProvenanceV1Schema } from '../modules/scale/device-input-provenance'

export const finalScaleSubmitSchema = z.object({
  submissionId: z.string().min(16).max(200),
  attemptEpoch: z.number().int().min(1),
  definitionHash: z.string().min(1).max(200),
  contextSnapshotHash: z.string().min(1).max(200).nullable().optional(),
  itemTimings: z.preprocess((raw,ctx)=>{if(raw&&typeof raw==='object'&&Object.prototype.hasOwnProperty.call(raw,'__proto__'))ctx.addIssue({code:z.ZodIssueCode.custom,message:'计时包含非法保留题目编码'});return raw},z.record(z.string(), z.unknown())).optional(),
  deviceInputProvenance: deviceInputProvenanceV1Schema.optional(),
  answers: z.array(z.object({
    itemCode: z.string().min(1).max(200),
    responseValue: z.union([z.string(), z.number().finite()]),
    responseTimeMs: z.number().finite().nonnegative().optional(),
    changeCount: z.number().int().nonnegative().optional(),
  }).strict()).max(1000),
}).strict()

// Response selection is separate from the sealed scientific submission body.
export const compositeScaleFinalResponseQuerySchema = z.object({
  response: z.literal('receipt').optional(),
}).strict()
