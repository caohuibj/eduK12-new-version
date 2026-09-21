import {
  NO_REFERENCE_REPORT,
  SIMULATED_REPORT_V1,
  SIMULATED_REPORT_V2,
  type CognitiveTaskSeedDeclarationV1,
} from '../task-seed'

export const digitbackwardSeedDeclarations = [
  {
    testType: 'digitbackward',
    configVersion: '1.0.0',
    name: 'Digit Span Backward Pilot v1.0.0',
    status: 'DRAFT',
    engineVersion: '1.0.0',
    scoringVersion: '1.0.0',
    config: { startSpan: 2, maxSpan: 7, trialsPerLevel: 2, digitDisplayMs: 800, digitIntervalMs: 200, readyDurationMs: 800, inactivityGuardMs: 30000, stimulusSetVersion: 'digits-v1.0.0', report: NO_REFERENCE_REPORT },
  },
] satisfies CognitiveTaskSeedDeclarationV1[]
