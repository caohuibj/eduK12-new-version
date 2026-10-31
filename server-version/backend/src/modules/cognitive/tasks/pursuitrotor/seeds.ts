import type { CognitiveSeed } from '../../task-seed.types'

const SIMULATED_REPORT_V1 = {
  reportVersion: '1.0.0',
  referenceMode: 'simulated' as const,
  referenceVersion: 'sim-k12-v0.1',
  referenceBand: 'K7-9',
}

export const seeds: CognitiveSeed[] = [
  {
    testType: 'pursuitrotor',
    configVersion: '1.0.0',
    name: 'Pursuit Rotor v1.0.0 (4 trials × 20s, 4s/rev)',
    status: 'DRAFT',
    engineVersion: '1.0.0',
    scoringVersion: '1.0.0',
    config: { totalTrials: 4, trackMs: 20000, revolutionMs: 4000, report: SIMULATED_REPORT_V1 },
  },
]
