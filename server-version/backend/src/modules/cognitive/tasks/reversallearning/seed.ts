import {
  NO_REFERENCE_REPORT,
  SIMULATED_REPORT_V1,
  SIMULATED_REPORT_V2,
  type CognitiveTaskSeedDeclarationV1,
} from '../task-seed'

export const reversallearningSeedDeclarations = [
  {
    testType: 'reversallearning',
    configVersion: '1.0.0',
    name: 'Probabilistic Reversal Learning Pilot v1.0.0',
    status: 'DRAFT',
    engineVersion: '1.0.0',
    scoringVersion: '1.0.0',
    config: { totalTrials: 120, acquisitionTrials: 60, reversalTrials: 60, criterionConsecutiveCorrect: 6, rewardProbability: 0.8, trialTimeoutMs: 3000, stimulusSetVersion: 'reversal-symbols-v1.0.0', report: NO_REFERENCE_REPORT },
  },
] satisfies CognitiveTaskSeedDeclarationV1[]
