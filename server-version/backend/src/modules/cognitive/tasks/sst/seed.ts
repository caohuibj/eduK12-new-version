import {
  NO_REFERENCE_REPORT,
  SIMULATED_REPORT_V1,
  SIMULATED_REPORT_V2,
  type CognitiveTaskSeedDeclarationV1,
} from '../task-seed'

export const sstSeedDeclarations = [
  {
    testType: 'sst',
    configVersion: '1.0.0',
    name: 'Stop-Signal Task v1.0.0',
    status: 'PUBLISHED',
    engineVersion: '1.0.0',
    scoringVersion: '1.0.0',
    config: { totalTrials: 96, stopRatio: 0.25, ssdStartMs: 250, ssdMinMs: 50, ssdMaxMs: 800, ssdStepMs: 50, goTimeoutMs: 1000, isiMs: 500, validRtFloorMs: 100, report: NO_REFERENCE_REPORT },
  },
] satisfies CognitiveTaskSeedDeclarationV1[]
