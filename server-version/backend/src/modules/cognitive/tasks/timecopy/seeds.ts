import type { CognitiveSeed } from '../../task-seed.types'

const SIMULATED_REPORT_V1 = {
  reportVersion: '1.0.0',
  referenceMode: 'simulated' as const,
  referenceVersion: 'sim-k12-v0.1',
  referenceBand: 'K7-9',
}

export const seeds: CognitiveSeed[] = [
  {
    testType: 'timecopy',
    configVersion: '1.0.0',
    name: 'Interval Reproduction v1.0.0 (1.0-3.0s targets, 10 trials)',
    status: 'PUBLISHED',
    engineVersion: '1.0.0',
    scoringVersion: '1.0.0',
    config: { totalTrials: 10, targetMinMs: 1000, targetMaxMs: 3000, maxResponseMs: 10000, report: SIMULATED_REPORT_V1 },
  },
]
