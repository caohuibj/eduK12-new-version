import type { AssessmentVideoPresentationV1 } from '../assessment-media/types'
import type { CognitivePresentationDefinitionV1 } from './types'

export type CognitiveVideoSlot = 'instruction' | 'example' | 'stimulus'

export interface CognitiveVideoPresentationEntry {
  key: string
  slot: CognitiveVideoSlot
  index: number
  presentation: AssessmentVideoPresentationV1
}

const SLOT_ORDER: CognitiveVideoSlot[] = ['instruction', 'example', 'stimulus']

export const cognitiveVideoPresentationEntries = (
  presentation?: CognitivePresentationDefinitionV1,
): CognitiveVideoPresentationEntry[] => {
  if (!presentation?.videos) return []
  return SLOT_ORDER.flatMap((slot) => (
    (presentation.videos?.[slot] ?? []).map((video, index) => ({
      key: `${slot}:${index}`,
      slot,
      index,
      presentation: video,
    }))
  ))
}
