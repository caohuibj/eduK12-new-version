import {z} from 'zod'

/** Frozen administration instruction of the distributed version. Presentation
 * content only: outside the definition/measurement hash, immutable per
 * attempt once frozen, and resumed sessions read it instead of the live
 * Scale row. */
export const frozenScaleInstructionSchema = z.object({
  text: z.string().min(1),
  language: z.string().min(2).optional(),
  version: z.string().min(1).optional(),
  origin: z.enum(['INSTRUMENT_SOURCE', 'SCALE_FIELD']),
}).strict()
export type FrozenScaleInstruction = z.infer<typeof frozenScaleInstructionSchema>
