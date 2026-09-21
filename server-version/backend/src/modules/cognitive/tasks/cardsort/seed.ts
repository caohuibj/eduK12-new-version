import {
  NO_REFERENCE_REPORT,
  SIMULATED_REPORT_V1,
  SIMULATED_REPORT_V2,
  type CognitiveTaskSeedDeclarationV1,
} from '../task-seed'

export const cardsortSeedDeclarations = [
  {
    testType: 'cardsort',
    configVersion: '1.0.0',
    name: 'Rule Card Sort Pilot v1.0.0',
    status: 'DRAFT',
    engineVersion: '1.0.0',
    scoringVersion: '1.0.0',
    config: { totalTrials: 72, switchRatio: 0.33, blockCount: 3, cueMs: 500, stimulusMs: 2000, isiMs: 350, validRtFloorMs: 150, stimulusSetVersion: 'geometric-cards-v1.0.0', report: NO_REFERENCE_REPORT },
  },
] satisfies CognitiveTaskSeedDeclarationV1[]
