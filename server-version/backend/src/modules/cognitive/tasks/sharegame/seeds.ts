import type { CognitiveSeed } from '../../task-seed.types'

const SIMULATED_REPORT_V1 = {
  reportVersion: '1.0.0',
  referenceMode: 'simulated' as const,
  referenceVersion: 'sim-k12-v0.1',
  referenceBand: 'K7-9',
}

export const seeds: CognitiveSeed[] = [
  {
    testType: 'sharegame',
    configVersion: '1.0.0',
    name: 'Dictator-style Sharing v1.0.0 (5 rounds, endowments 20-100)',
    status: 'PUBLISHED',
    engineVersion: '1.0.0',
    scoringVersion: '1.0.0',
    config: { endowments: [20, 50, 100, 50, 100], fixationMs: 400, timeoutMs: 20000, report: SIMULATED_REPORT_V1 },
  },
]
