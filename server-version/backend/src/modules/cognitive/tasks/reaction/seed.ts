import {
  NO_REFERENCE_REPORT,
  SIMULATED_REPORT_V1,
  SIMULATED_REPORT_V2,
  type CognitiveTaskSeedDeclarationV1,
} from '../task-seed'

export const reactionSeedDeclarations = [
  {
    testType: 'reaction',
    configVersion: '1.0.1',
    name: 'Reaction Time v1.0.1 [INTERNAL PILOT]',
    status: 'PUBLISHED',
    engineVersion: '1.0.0',
    scoringVersion: '1.0.0',
    config: { totalTrials: 20, foreperiodMinMs: 700, foreperiodMaxMs: 1500, timeoutMs: 2000, readyDurationMs: 1000, report: SIMULATED_REPORT_V1 },
  },
  {
    testType: 'reaction',
    configVersion: '1.1.0',
    name: 'Reaction Time v1.1.0',
    status: 'PUBLISHED',
    engineVersion: '1.0.0',
    scoringVersion: '1.1.0',
    config: { totalTrials: 20, foreperiodMinMs: 700, foreperiodMaxMs: 1500, timeoutMs: 2000, readyDurationMs: 1000, report: SIMULATED_REPORT_V2 },
  },
] satisfies CognitiveTaskSeedDeclarationV1[]
