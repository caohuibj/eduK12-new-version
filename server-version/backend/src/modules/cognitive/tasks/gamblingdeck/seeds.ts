import type { CognitiveSeed } from '../../task-seed.types'

const NO_REFERENCE_REPORT = {
  reportVersion: '1.0.1',
  referenceMode: 'none' as const,
}

export const seeds: CognitiveSeed[] = [
  {
    testType: 'gamblingdeck',
    configVersion: '1.0.1',
    name: 'Gambling Deck (IGT-structured) v1.0.1 (60 trials, block 20)',
    status: 'DRAFT',
    engineVersion: '1.0.1',
    scoringVersion: '1.0.0',
    config: { totalTrials: 60, blockSize: 20, fixationMs: 400, feedbackMs: 1200, report: NO_REFERENCE_REPORT },
  },
]
