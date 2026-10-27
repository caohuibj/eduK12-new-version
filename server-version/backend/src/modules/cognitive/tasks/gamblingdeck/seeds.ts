import type { CognitiveSeed } from '../../task-seed.types'

const SIMULATED_REPORT_V1 = {
  reportVersion: '1.0.0',
  referenceMode: 'simulated' as const,
  referenceVersion: 'sim-k12-v0.1',
  referenceBand: 'K7-9',
}

export const seeds: CognitiveSeed[] = [
  {
    testType: 'gamblingdeck',
    configVersion: '1.0.0',
    name: 'Gambling Deck (IGT-structured) v1.0.0 (60 trials, block 20)',
    status: 'PUBLISHED',
    engineVersion: '1.0.0',
    scoringVersion: '1.0.0',
    config: { totalTrials: 60, blockSize: 20, fixationMs: 400, feedbackMs: 1200, report: SIMULATED_REPORT_V1 },
  },
]
