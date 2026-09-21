import {
  NO_REFERENCE_REPORT,
  SIMULATED_REPORT_V1,
  SIMULATED_REPORT_V2,
  type CognitiveTaskSeedDeclarationV1,
} from '../task-seed'

export const pairedassociateSeedDeclarations = [
  {
    testType: 'pairedassociate',
    configVersion: '1.0.0',
    name: 'Paired Associate Learning Pilot v1.0.0',
    status: 'DRAFT',
    engineVersion: '1.0.0',
    scoringVersion: '1.0.0',
    config: { pairCount: 12, learningRounds: 3, delayedEnabled: false, delayedDelayMs: 0, studyDurationMs: 12000, inactivityGuardMs: 90000, stimulusSetVersion: 'nonverbal-pairs-v1.0.0', report: NO_REFERENCE_REPORT },
  },
] satisfies CognitiveTaskSeedDeclarationV1[]
