import { z } from 'zod'
import {
  LEXICALDECISION_PSEUDOWORD_GENERATOR_VERSION,
  LEXICALDECISION_STIMULUS_SET_VERSION,
} from './lexicaldecision.config'

const responseSchema = z.enum(['word', 'nonword']).nullable()

export const lexicaldecisionTrialSchema = z.object({
  stimulusId: z.string().regex(/^zh-(real|pseudo)-[23]-[a-z]+-\d{3}$/),
  stimulusVersion: z.literal(LEXICALDECISION_STIMULUS_SET_VERSION),
  lexicality: z.enum(['real', 'pseudo']),
  wordLength: z.union([z.literal(2), z.literal(3)]),
  frequencyBand: z.enum(['high', 'medium', 'low']),
  pseudowordGeneratorVersion: z.literal(LEXICALDECISION_PSEUDOWORD_GENERATOR_VERSION),
  response: responseSchema,
  rtMs: z.number().int().nonnegative().max(600000).nullable(),
  interrupted: z.boolean(),
}).strict().refine((value) => (value.response === null) === (value.rtMs === null), {
  message: 'response and rtMs must be both null or both present',
  path: ['rtMs'],
})

export type LexicaldecisionTrial = z.infer<typeof lexicaldecisionTrialSchema>
