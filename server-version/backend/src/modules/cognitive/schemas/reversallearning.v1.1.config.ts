import { z } from 'zod'
import { reversallearningConfigSchema } from './reversallearning.config'

export const reversallearningV11ConfigSchema = reversallearningConfigSchema.safeExtend({
  practiceTrialCount: z.number().int().min(4).max(30).default(4),
  practiceAcquisitionOnly: z.boolean().default(false),
})
