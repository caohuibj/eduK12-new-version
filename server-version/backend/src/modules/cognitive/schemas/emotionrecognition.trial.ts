import { z } from 'zod'
import { EMOTIONRECOGNITION_STIMULUS_SET_VERSION } from './emotionrecognition.config'

export const EMOTIONS = ['happy', 'sad', 'angry', 'fear', 'disgust', 'surprise'] as const
export const emotionSchema = z.enum(EMOTIONS)

export const emotionrecognitionTrialSchema = z.object({
  stimulusId: z.string().regex(/^emotion-identity-\d{2}-(happy|sad|angry|fear|disgust|surprise)$/),
  stimulusVersion: z.literal(EMOTIONRECOGNITION_STIMULUS_SET_VERSION),
  responseEmotion: emotionSchema.nullable(),
  rtMs: z.number().int().nonnegative().max(600000).nullable(),
  interrupted: z.boolean(),
}).strict().refine((value) => (value.responseEmotion === null) === (value.rtMs === null), {
  message: 'responseEmotion and rtMs must be both null or both present',
  path: ['rtMs'],
})

export type EmotionrecognitionTrial = z.infer<typeof emotionrecognitionTrialSchema>
export type EmotionCategory = typeof EMOTIONS[number]
