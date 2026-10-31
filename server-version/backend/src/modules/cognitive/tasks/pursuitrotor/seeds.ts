import type { CognitiveSeed } from '../../task-seed.types'

const NO_REFERENCE_REPORT = {
  reportVersion: '1.0.1',
  referenceMode: 'none' as const,
}

export const seeds: CognitiveSeed[] = [
  {
    testType: 'pursuitrotor',
    configVersion: '1.0.1',
    name: 'Pursuit Rotor v1.0.1 (4 trials × 20s, 4s/rev)',
    status: 'DRAFT',
    engineVersion: '1.0.1',
    scoringVersion: '1.0.0',
    config: { totalTrials: 4, trackMs: 20000, revolutionMs: 4000, report: NO_REFERENCE_REPORT },
  },
]
