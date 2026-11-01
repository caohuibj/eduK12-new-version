import type { CognitiveSeed } from '../../task-seed.types'

const NO_REFERENCE_REPORT = {
  reportVersion: '1.0.1',
  referenceMode: 'none' as const,
}

export const seeds: CognitiveSeed[] = [
  {
    testType: 'timecopy',
    configVersion: '1.0.1',
    name: 'Interval Reproduction v1.0.1 (1.0-3.0s targets, 10 trials)',
    status: 'DRAFT',
    engineVersion: '1.0.1',
    scoringVersion: '1.0.0',
    config: { totalTrials: 10, targetMinMs: 1000, targetMaxMs: 3000, maxResponseMs: 10000, report: NO_REFERENCE_REPORT },
  },
]
