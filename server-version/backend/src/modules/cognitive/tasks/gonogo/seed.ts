import {
  NO_REFERENCE_REPORT,
  SIMULATED_REPORT_V1,
  SIMULATED_REPORT_V2,
  type CognitiveTaskSeedDeclarationV1,
} from '../task-seed'

export const gonogoSeedDeclarations = [
  {
    testType: 'gonogo',
    configVersion: '1.0.0',
    name: 'Go/No-Go v1.0.0',
    status: 'PUBLISHED',
    engineVersion: '1.0.0',
    scoringVersion: '1.0.0',
    config: { totalTrials: 120, nogoRatio: 0.25, stimulusMs: 800, isiMs: 500, validRtFloorMs: 100, report: NO_REFERENCE_REPORT },
  },
] satisfies CognitiveTaskSeedDeclarationV1[]
