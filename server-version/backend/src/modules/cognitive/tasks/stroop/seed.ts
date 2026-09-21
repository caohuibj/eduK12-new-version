import {
  NO_REFERENCE_REPORT,
  SIMULATED_REPORT_V1,
  SIMULATED_REPORT_V2,
  type CognitiveTaskSeedDeclarationV1,
} from '../task-seed'

export const stroopSeedDeclarations = [
  {
    testType: 'stroop',
    configVersion: '1.0.1',
    name: 'Color-Word Stroop v1.0.1 [INTERNAL PILOT]',
    status: 'PUBLISHED',
    engineVersion: '1.0.0',
    scoringVersion: '1.0.0',
    config: { totalTrials: 24, congruentRatio: 0.5, fixationMs: 500, stimulusDurationMs: 2000, isiMs: 500, validRtFloorMs: 200, report: SIMULATED_REPORT_V1 },
  },
  {
    testType: 'stroop',
    configVersion: '1.1.0',
    name: 'Color-Word Stroop v1.1.0',
    status: 'PUBLISHED',
    engineVersion: '1.0.0',
    scoringVersion: '1.1.0',
    config: { totalTrials: 40, congruentRatio: 0.5, fixationMs: 500, stimulusDurationMs: 2000, isiMs: 500, validRtFloorMs: 200, report: SIMULATED_REPORT_V2 },
  },
] satisfies CognitiveTaskSeedDeclarationV1[]
