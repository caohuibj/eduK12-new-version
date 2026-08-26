import { z } from 'zod'
import { WORDLIST_STIMULUS_SET_VERSION } from './wordlist.config'

export const wordlistTrialSchema = z.object({
  listId: z.string().regex(/^wordlist-\d{2}$/),
  stimulusSetVersion: z.literal(WORDLIST_STIMULUS_SET_VERSION),
  responses: z.array(z.string().max(120)).max(64),
  responseDurationMs: z.number().int().nonnegative().max(600000),
  interrupted: z.boolean(),
}).strict()

export type WordlistTrial = z.infer<typeof wordlistTrialSchema>
