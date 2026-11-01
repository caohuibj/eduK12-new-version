import type { CognitiveSeed } from '../../task-seed.types'

const NO_REFERENCE_REPORT = {
  reportVersion: '1.0.1',
  referenceMode: 'none' as const,
}

export const seeds: CognitiveSeed[] = [
  {
    testType: 'trustgame',
    configVersion: '1.0.1',
    name: 'Ultimatum Responder v1.0.1 (8 rounds, pot 100)',
    status: 'DRAFT',
    engineVersion: '1.0.1',
    scoringVersion: '1.0.0',
    config: { offers: [50, 20, 80, 10, 40, 30, 60, 20], potTotal: 100, fixationMs: 400, timeoutMs: 20000, report: NO_REFERENCE_REPORT },
  },
]
