import type { CognitiveSeed } from '../../task-seed.types'

const NO_REFERENCE_REPORT = {
  reportVersion: '1.0.1',
  referenceMode: 'none' as const,
}

export const seeds: CognitiveSeed[] = [
  {
    testType: 'auditoryrt',
    configVersion: '1.0.1',
    name: 'Auditory Simple RT v1.0.1 (24 trials, 1-4s foreperiod, 880Hz tone)',
    status: 'DRAFT',
    engineVersion: '1.0.1',
    scoringVersion: '1.0.0',
    config: {
      totalTrials: 24,
      foreperiodMinMs: 1000,
      foreperiodMaxMs: 4000,
      toneFrequencyHz: 880,
      toneDurationMs: 120,
      maxRtWindowMs: 1500,
      interTrialIntervalMs: 800,
      report: NO_REFERENCE_REPORT,
    },
  },
]
