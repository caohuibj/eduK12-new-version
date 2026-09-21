import {
  NO_REFERENCE_REPORT,
  SIMULATED_REPORT_V1,
  SIMULATED_REPORT_V2,
  type CognitiveTaskSeedDeclarationV1,
} from '../task-seed'

export const bartSeedDeclarations = [
  {
    testType: 'bart',
    configVersion: '1.0.0',
    name: 'Balloon Pumping Pilot v1.0.0',
    status: 'DRAFT',
    engineVersion: '1.0.0',
    scoringVersion: '1.0.0',
    config: { balloonCount: 30, maxPumps: 12, trialTimeoutMs: 15000, pumpAnimationMs: 200, stimulusSetVersion: 'bart-generated-v1.0.0', report: NO_REFERENCE_REPORT },
  },
] satisfies CognitiveTaskSeedDeclarationV1[]
