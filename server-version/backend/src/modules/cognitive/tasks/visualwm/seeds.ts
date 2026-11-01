import type { CognitiveSeed } from '../../task-seed.types'
import { seedsV11 } from './seeds.v11'

const NO_REFERENCE_REPORT = {
  reportVersion: '1.0.1',
  referenceMode: 'none' as const,
}

export const seeds: CognitiveSeed[] = [
  {
    testType: 'visualwm',
    configVersion: '1.0.1',
    name: 'Change Detection v1.0.1 (16 trials, set size 3-6)',
    status: 'DRAFT',
    engineVersion: '1.0.1',
    scoringVersion: '1.0.0',
    config: { totalTrials: 16, studyMs: 500, retentionMs: 900, validRtFloorMs: 200, report: NO_REFERENCE_REPORT },
  },
  ...seedsV11,
]
