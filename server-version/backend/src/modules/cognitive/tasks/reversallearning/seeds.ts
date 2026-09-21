import type { CognitiveSeed } from '../../task-seed.types'
const SIMULATED_REPORT_V1 = {
  reportVersion: '1.0.0',
  referenceMode: 'simulated' as const,
  referenceVersion: 'sim-k12-v0.1',
  referenceBand: 'K7-9',
}
const SIMULATED_REPORT_V2 = {
  reportVersion: '1.1.0',
  referenceMode: 'simulated' as const,
  referenceVersion: 'lit-sim-k12-v0.2',
  referenceBand: 'K7-9',
}
const NO_REFERENCE_REPORT = {
  reportVersion: '1.0.0',
  referenceMode: 'none' as const,
}
export const seeds: CognitiveSeed[] = [
{
    testType: 'reversallearning',
    configVersion: '1.0.0',
    name: 'Probabilistic Reversal Learning Pilot v1.0.0',
    status: 'DRAFT',
    engineVersion: '1.0.0',
    scoringVersion: '1.0.0',
    config: { totalTrials: 120, acquisitionTrials: 60, reversalTrials: 60, criterionConsecutiveCorrect: 6, rewardProbability: 0.8, trialTimeoutMs: 3000, stimulusSetVersion: 'reversal-symbols-v1.0.0', report: NO_REFERENCE_REPORT },
  }
]
