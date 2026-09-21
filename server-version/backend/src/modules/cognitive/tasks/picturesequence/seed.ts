import {
  NO_REFERENCE_REPORT,
  SIMULATED_REPORT_V1,
  SIMULATED_REPORT_V2,
  type CognitiveTaskSeedDeclarationV1,
} from '../task-seed'

export const picturesequenceSeedDeclarations = [
  {
    testType: 'picturesequence',
    configVersion: '1.0.0',
    name: 'Picture Sequence Learning Pilot v1.0.0',
    status: 'DRAFT',
    engineVersion: '1.0.0',
    scoringVersion: '1.0.0',
    config: { itemCount: 12, learningRounds: 3, delayedEnabled: false, delayedDelayMs: 0, studyMsPerItem: 900, inactivityGuardMs: 60000, stimulusSetVersion: 'daily-scenes-v1.0.0', report: NO_REFERENCE_REPORT },
  },
] satisfies CognitiveTaskSeedDeclarationV1[]
