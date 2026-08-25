import { z } from 'zod'
import { reportMetaSchema } from './report-meta'

export const EMOTIONRECOGNITION_CATEGORY_VERSION = 'basic-emotion-6-v1.0.0'
export const EMOTIONRECOGNITION_STIMULUS_SET_VERSION = 'emotion-faces-ai-zh-v1.0.0'

export const emotionrecognitionConfigSchema = z.object({
  totalTrials: z.union([z.literal(24), z.literal(60), z.literal(120)]),
  stimulusMs: z.number().int().min(500).max(10000),
  trialTimeoutMs: z.number().int().min(1000).max(15000),
  isiMs: z.number().int().min(0).max(2000),
  validRtFloorMs: z.number().int().min(50).max(1500),
  emotionCategoryVersion: z.literal(EMOTIONRECOGNITION_CATEGORY_VERSION),
  stimulusSetVersion: z.literal(EMOTIONRECOGNITION_STIMULUS_SET_VERSION),
  report: reportMetaSchema,
}).strict()

export type EmotionrecognitionConfig = z.infer<typeof emotionrecognitionConfigSchema>
