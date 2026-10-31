import type { CognitiveSeed } from '../../task-seed.types'

const SIMULATED_REPORT_V1 = {
  reportVersion: '1.0.0',
  referenceMode: 'simulated' as const,
  referenceVersion: 'sim-k12-v0.1',
  referenceBand: 'K7-9',
}

export const seeds: CognitiveSeed[] = [
  {
    testType: 'trustgame',
    configVersion: '1.0.0',
    name: 'Ultimatum Responder v1.0.0 (8 rounds, pot 100)',
    status: 'DRAFT',
    engineVersion: '1.0.0',
    scoringVersion: '1.0.0',
    config: { offers: [50, 20, 80, 10, 40, 30, 60, 20], potTotal: 100, fixationMs: 400, timeoutMs: 20000, report: SIMULATED_REPORT_V1 },
  },
]
