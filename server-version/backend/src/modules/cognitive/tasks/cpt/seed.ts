import {
  NO_REFERENCE_REPORT,
  SIMULATED_REPORT_V1,
  SIMULATED_REPORT_V2,
  type CognitiveTaskSeedDeclarationV1,
} from '../task-seed'

export const cptSeedDeclarations = [
  {
    testType: 'cpt',
    configVersion: '1.0.0',
    name: 'CPT-X v1.0.0',
    status: 'PUBLISHED',
    engineVersion: '1.0.0',
    scoringVersion: '1.0.0',
    config: { totalTrials: 180, targetRatio: 0.2, blockCount: 3, stimulusMs: 500, isiMs: 1000, validRtFloorMs: 100, perseverationRtMs: 100, report: NO_REFERENCE_REPORT },
  },
] satisfies CognitiveTaskSeedDeclarationV1[]
