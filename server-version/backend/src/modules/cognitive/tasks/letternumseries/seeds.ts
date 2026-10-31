import type { CognitiveSeed } from '../../task-seed.types'

const SIMULATED_REPORT_V1 = {
  reportVersion: '1.0.0',
  referenceMode: 'simulated' as const,
  referenceVersion: 'sim-k12-v0.1',
  referenceBand: 'K7-9',
}

export const seeds: CognitiveSeed[] = [
  {
    testType: 'letternumseries',
    configVersion: '1.0.0',
    name: 'Letter-Number Sequencing v1.0.0 (4 letters + 3 digits per trial)',
    status: 'DRAFT',
    engineVersion: '1.0.0',
    scoringVersion: '1.0.0',
    config: { totalTrials: 10, lettersPerTrial: 4, digitsPerTrial: 3, stimulusMs: 700, isiMs: 300, report: SIMULATED_REPORT_V1 },
  },
]
