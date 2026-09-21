import {
  NO_REFERENCE_REPORT,
  SIMULATED_REPORT_V1,
  SIMULATED_REPORT_V2,
  type CognitiveTaskSeedDeclarationV1,
} from '../task-seed'

export const patterncompareSeedDeclarations = [
  {
    testType: 'patterncompare',
    configVersion: '1.0.0',
    name: 'Pattern Comparison Pilot v1.0.0',
    status: 'DRAFT',
    engineVersion: '1.0.0',
    scoringVersion: '1.0.0',
    config: { durationSec: 60, trialTimeoutMs: 2500, isiMs: 250, validRtFloorMs: 150, stimulusSetVersion: 'geometric-v1.0.0', report: NO_REFERENCE_REPORT },
  },
] satisfies CognitiveTaskSeedDeclarationV1[]
