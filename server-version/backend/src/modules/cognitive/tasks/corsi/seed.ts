import {
  NO_REFERENCE_REPORT,
  SIMULATED_REPORT_V1,
  SIMULATED_REPORT_V2,
  type CognitiveTaskSeedDeclarationV1,
} from '../task-seed'

export const corsiSeedDeclarations = [
  {
    testType: 'corsi',
    configVersion: '1.0.0',
    name: 'Corsi Block-Tapping v1.0.0',
    status: 'PUBLISHED',
    engineVersion: '1.0.0',
    scoringVersion: '1.0.0',
    config: { startSpan: 3, maxSpan: 8, trialsPerLevel: 2, boardSize: 9, highlightMs: 500, intervalMs: 250, readyDurationMs: 800, inactivityGuardMs: 30000, report: NO_REFERENCE_REPORT },
  },
] satisfies CognitiveTaskSeedDeclarationV1[]
