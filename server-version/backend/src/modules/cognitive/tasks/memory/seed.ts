import {
  NO_REFERENCE_REPORT,
  SIMULATED_REPORT_V1,
  SIMULATED_REPORT_V2,
  type CognitiveTaskSeedDeclarationV1,
} from '../task-seed'

export const memorySeedDeclarations = [
  {
    testType: 'memory',
    configVersion: '1.0.1',
    name: 'Working Memory Span v1.0.1 [INTERNAL PILOT]',
    status: 'PUBLISHED',
    engineVersion: '1.0.0',
    scoringVersion: '1.0.0',
    config: { startLength: 2, maxLength: 11, trialsPerLevel: 2, digitDisplayMs: 800, digitIntervalMs: 200, readyDurationMs: 1000, inactivityGuardMs: 30000, report: SIMULATED_REPORT_V1 },
  },
  {
    testType: 'memory',
    configVersion: '1.1.0',
    name: 'Working Memory Span v1.1.0',
    status: 'PUBLISHED',
    engineVersion: '1.0.0',
    scoringVersion: '1.1.0',
    config: { startLength: 3, maxLength: 9, trialsPerLevel: 2, digitDisplayMs: 800, digitIntervalMs: 200, readyDurationMs: 1000, inactivityGuardMs: 30000, report: SIMULATED_REPORT_V2 },
  },
] satisfies CognitiveTaskSeedDeclarationV1[]
