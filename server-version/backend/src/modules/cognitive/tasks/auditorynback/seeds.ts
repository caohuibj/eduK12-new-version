import type { CognitiveSeed } from '../../task-seed.types'

const NO_REFERENCE_REPORT = {
  reportVersion: '1.0.1',
  referenceMode: 'none' as const,
}

export const seeds: CognitiveSeed[] = [
  {
    testType: 'auditorynback',
    configVersion: '1.0.1',
    name: 'Auditory Tone n-back v1.0.1 (2-back, 40 trials, 5 tones, target ratio 0.3)',
    status: 'DRAFT',
    engineVersion: '1.0.1',
    scoringVersion: '1.0.0',
    config: {
      nLevel: 2,
      totalTrials: 40,
      targetRatio: 0.3,
      stimulusMs: 500,
      isiMs: 1500,
      toneFrequenciesHz: [262, 330, 392, 494, 587],
      report: NO_REFERENCE_REPORT,
    },
  },
]
