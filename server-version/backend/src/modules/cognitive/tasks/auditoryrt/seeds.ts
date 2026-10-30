import type { CognitiveSeed } from '../../task-seed.types'

const SIMULATED_REPORT_V1 = {
  reportVersion: '1.0.0',
  referenceMode: 'simulated' as const,
  referenceVersion: 'sim-k12-v0.1',
  referenceBand: 'K7-9',
}

export const seeds: CognitiveSeed[] = [
  {
    testType: 'auditoryrt',
    configVersion: '1.0.0',
    name: 'Auditory Simple RT v1.0.0 (24 trials, 1-4s foreperiod, 880Hz tone)',
    status: 'DRAFT',
    engineVersion: '1.0.0',
    scoringVersion: '1.0.0',
    config: {
      totalTrials: 24,
      foreperiodMinMs: 1000,
      foreperiodMaxMs: 4000,
      toneFrequencyHz: 880,
      toneDurationMs: 120,
      maxRtWindowMs: 1500,
      interTrialIntervalMs: 800,
      report: SIMULATED_REPORT_V1,
    },
  },
]
