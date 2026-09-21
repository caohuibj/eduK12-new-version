import type { CognitiveFrontendParticipantPresentationV1 } from '../../participant-presentation.types'

export const memoryParticipantPresentation = {
  "schemaVersion": 1,
  "version": "1.0.0",
  "metricCopy": {
    "maxSpan": {
      "explanation": "最长正确序列：本次任务中能够正确完成的最高序列长度。"
    },
    "totalCorrectTrials": {
      "explanation": "正确试次数：本次正式测验中完整答对的试次数。"
    }
  }
} as const satisfies CognitiveFrontendParticipantPresentationV1
