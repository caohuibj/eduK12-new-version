import type { CognitiveSeed } from '../../task-seed.types'
import { CANCELLATION_STIMULUS_SET_VERSION } from './generator'

const NO_REFERENCE_REPORT = {
  reportVersion: '1.0.1',
  referenceMode: 'none' as const,
}

export const seeds: CognitiveSeed[] = [
  {
    testType: 'cancellation',
    configVersion: '1.0.1',
    name: 'Visual Cancellation v1.0.1 (2 scans × 45s, 10×8 grid)',
    status: 'DRAFT',
    engineVersion: '1.0.1',
    scoringVersion: '1.0.0',
    config: { totalTrials: 2, durationMs: 45000, stimulusSetVersion: CANCELLATION_STIMULUS_SET_VERSION, report: NO_REFERENCE_REPORT },
  },
]
