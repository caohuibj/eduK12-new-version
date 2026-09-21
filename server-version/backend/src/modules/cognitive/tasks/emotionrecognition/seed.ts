import {
  NO_REFERENCE_REPORT,
  SIMULATED_REPORT_V1,
  SIMULATED_REPORT_V2,
  type CognitiveTaskSeedDeclarationV1,
} from '../task-seed'

export const emotionrecognitionSeedDeclarations = [
  {
    testType: 'emotionrecognition',
    configVersion: '1.0.0',
    name: 'Six Basic Emotion Face Classification Pilot v1.0.0',
    status: 'DRAFT',
    engineVersion: '1.0.0',
    scoringVersion: '1.0.0',
    config: { totalTrials: 60, stimulusMs: 3000, trialTimeoutMs: 5000, isiMs: 300, validRtFloorMs: 200, emotionCategoryVersion: 'basic-emotion-6-v1.0.0', stimulusSetVersion: 'emotion-faces-ai-zh-v1.0.0', report: NO_REFERENCE_REPORT },
  },
] satisfies CognitiveTaskSeedDeclarationV1[]
