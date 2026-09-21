import {
  NO_REFERENCE_REPORT,
  SIMULATED_REPORT_V1,
  SIMULATED_REPORT_V2,
  type CognitiveTaskSeedDeclarationV1,
} from '../task-seed'

export const flankerSeedDeclarations = [
  {
    testType: 'flanker',
    configVersion: '1.0.0',
    name: 'Flanker Pilot v1.0.0',
    status: 'DRAFT',
    engineVersion: '1.0.0',
    scoringVersion: '1.0.0',
    config: { totalTrials: 80, congruentRatio: 0.5, stimulusMs: 1800, isiMs: 400, validRtFloorMs: 150, stimulusSetVersion: 'arrows-v1.0.0', report: NO_REFERENCE_REPORT },
  },
] satisfies CognitiveTaskSeedDeclarationV1[]
