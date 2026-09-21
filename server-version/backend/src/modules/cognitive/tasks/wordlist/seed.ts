import {
  NO_REFERENCE_REPORT,
  SIMULATED_REPORT_V1,
  SIMULATED_REPORT_V2,
  type CognitiveTaskSeedDeclarationV1,
} from '../task-seed'

export const wordlistSeedDeclarations = [
  {
    testType: 'wordlist',
    configVersion: '1.0.0',
    name: 'Chinese Wordlist Free Recall Pilot v1.0.0',
    status: 'DRAFT',
    engineVersion: '1.0.0',
    scoringVersion: '1.0.0',
    config: { listLength: 12, learningRounds: 3, delayedEnabled: false, delayedDelayMs: 60000, studyMsPerWord: 800, recallTimeoutMs: 60000, inactivityGuardMs: 120000, inputMode: 'typed-free-recall', normalizationVersion: 'wordlist-normalization-v1.0.0', stimulusSetVersion: 'chinese-wordlist-v1.0.0', report: NO_REFERENCE_REPORT },
  },
] satisfies CognitiveTaskSeedDeclarationV1[]
