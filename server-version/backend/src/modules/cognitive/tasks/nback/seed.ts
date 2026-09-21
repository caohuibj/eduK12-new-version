import {
  NO_REFERENCE_REPORT,
  SIMULATED_REPORT_V1,
  SIMULATED_REPORT_V2,
  type CognitiveTaskSeedDeclarationV1,
} from '../task-seed'

export const nbackSeedDeclarations = [
  {
    testType: 'nback',
    configVersion: '1.0.0',
    name: 'N-Back v1.0.0',
    status: 'PUBLISHED',
    engineVersion: '1.0.0',
    scoringVersion: '1.0.0',
    config: { nLevels: [1, 2], trialCountByN: [40, 60], blockCountByN: [1, 1], targetRatio: 0.3, stimulusMs: 500, isiMs: 2000, validRtFloorMs: 150, report: NO_REFERENCE_REPORT },
  },
] satisfies CognitiveTaskSeedDeclarationV1[]
