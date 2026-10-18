import {z} from 'zod'
/** Browser-observed foreground timings are descriptive research provenance,
 * never a server-verified attention measure or an input to a scorer. */
export const scaleTimingItemSchema=z.object({
  schemaVersion:z.literal(1),
  firstResponseMs:z.number().int().min(0).max(86400000).nullable(),
  activeTimeMs:z.number().int().min(0).max(86400000),
  changeCount:z.number().int().min(0).max(10000),
  revisitCount:z.number().int().min(0).max(10000),
  visits:z.number().int().min(0).max(10000),
  interrupted:z.boolean(),
  recoveredWithoutClock:z.boolean(),
}).strict()
export type ScaleItemTimingV1=z.infer<typeof scaleTimingItemSchema>
