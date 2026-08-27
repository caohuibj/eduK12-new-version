import { z } from 'zod'
import { WORDLIST_STIMULUS_SET_VERSION } from './wordlist.config'

export const wordlistTrialSchema = z.object({
  listId: z.string().regex(/^wordlist-\d{2}$/),
  stimulusSetVersion: z.literal(WORDLIST_STIMULUS_SET_VERSION),
  // Optional keeps legacy raw sessions readable. New v2 runners include the
  // phase so the envelope and task payload describe the same protocol step.
  phase: z.enum(['learning', 'delayed']).optional(),
  responses: z.array(z.string().max(120)).max(64),
  responseDurationMs: z.number().int().nonnegative().max(600000),
  interrupted: z.boolean(),
}).strict()

export type WordlistTrial = z.infer<typeof wordlistTrialSchema>
