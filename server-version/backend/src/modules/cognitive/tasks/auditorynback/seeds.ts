import type { CognitiveSeed } from '../../task-seed.types'

const SIMULATED_REPORT_V1 = {
  reportVersion: '1.0.0',
  referenceMode: 'simulated' as const,
  referenceVersion: 'sim-k12-v0.1',
  referenceBand: 'K7-9',
}

export const seeds: CognitiveSeed[] = [
  {
    testType: 'auditorynback',
    configVersion: '1.0.0',
    name: 'Auditory Tone n-back v1.0.0 (2-back, 40 trials, 5 tones, target ratio 0.3)',
    status: 'DRAFT',
    engineVersion: '1.0.0',
    scoringVersion: '1.0.0',
    config: {
      nLevel: 2,
      totalTrials: 40,
      targetRatio: 0.3,
      stimulusMs: 500,
      isiMs: 1500,
      toneFrequenciesHz: [262, 330, 392, 494, 587],
      report: SIMULATED_REPORT_V1,
    },
  },
]
