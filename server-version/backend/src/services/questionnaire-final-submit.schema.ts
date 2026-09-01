import { z } from 'zod'

export const finalQuestionnaireFormSectionSubmitSchema = z.object({
  submissionId: z.string().min(16).max(200),
  attemptEpoch: z.number().int().min(1),
  definitionHash: z.string().min(1).max(200),
  contextSnapshotHash: z.string().min(1).max(200).nullable().optional(),
  answers: z.array(z.object({
    formItemId: z.string().min(1),
    value: z.union([z.string(), z.array(z.string()), z.null()]),
  }).strict()).max(1000),
}).strict()
