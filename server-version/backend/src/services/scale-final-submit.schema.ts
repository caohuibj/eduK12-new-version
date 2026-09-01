import { z } from 'zod'

export const finalScaleSubmitSchema = z.object({
  submissionId: z.string().min(16).max(200),
  attemptEpoch: z.number().int().min(1),
  definitionHash: z.string().min(1).max(200),
  contextSnapshotHash: z.string().min(1).max(200).nullable().optional(),
  answers: z.array(z.object({
    itemCode: z.string().min(1).max(200),
    responseValue: z.union([z.string(), z.number().finite()]),
    responseTimeMs: z.number().finite().nonnegative().optional(),
    changeCount: z.number().int().nonnegative().optional(),
  }).strict()).max(1000),
}).strict()
