import {
  NO_REFERENCE_REPORT,
  SIMULATED_REPORT_V1,
  SIMULATED_REPORT_V2,
  type CognitiveTaskSeedDeclarationV1,
} from '../task-seed'

export const fakeSeedDeclarations = [
  {
    testType: 'fake',
    configVersion: '1.0.0',
    name: 'Fake Cognitive Test v1.0.0',
    status: 'PUBLISHED',
    engineVersion: '1.0.0',
    scoringVersion: '1.0.0',
    config: { trialCount: 3, trialDurationMs: 1000, allowPractice: false, maxRtMs: 60000 },
  },
] satisfies CognitiveTaskSeedDeclarationV1[]
