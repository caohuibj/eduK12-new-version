import { z } from 'zod'

export const sstTrialSchema = z
  .object({
    trialType: z.enum(['go', 'stop']),
    goStimulus: z.enum(['left', 'right']),
    response: z.enum(['left', 'right']).nullable(),
    rtMs: z.number().min(0).nullable().transform((value) => (value == null ? null : Math.round(value))),
    ssdMs: z.number().int().min(0).nullable(),
    stopSignalPresented: z.boolean(),
    interrupted: z.boolean(),
  })
  .strict()
  .refine((value) => (value.response == null) === (value.rtMs == null), {
    message: 'response and rtMs must both be present or both be null',
  })
  .refine((value) => value.stopSignalPresented === (value.trialType === 'stop'), {
    message: 'stopSignalPresented must match trialType',
  })
  .refine((value) => (value.trialType === 'stop') === (value.ssdMs != null), {
    message: 'ssdMs is required on stop trials and forbidden on go trials',
  })

export type SstTrial = z.infer<typeof sstTrialSchema>
