import type { CognitiveSeed } from '../../task-seed.types'

const NO_REFERENCE_REPORT = {
  reportVersion: '1.0.1',
  referenceMode: 'none' as const,
}

export const seeds: CognitiveSeed[] = [
  {
    testType: 'letternumseries',
    configVersion: '1.0.1',
    name: 'Letter-Number Sequencing v1.0.1 (4 letters + 3 digits per trial)',
    status: 'DRAFT',
    engineVersion: '1.0.1',
    scoringVersion: '1.0.0',
    config: { totalTrials: 10, lettersPerTrial: 4, digitsPerTrial: 3, stimulusMs: 700, isiMs: 300, report: NO_REFERENCE_REPORT },
  },
]
