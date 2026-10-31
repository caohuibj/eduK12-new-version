import type { CognitiveSeed } from '../../task-seed.types'

const SIMULATED_REPORT_V1 = {
  reportVersion: '1.0.0',
  referenceMode: 'simulated' as const,
  referenceVersion: 'sim-k12-v0.1',
  referenceBand: 'K7-9',
}

export const seeds: CognitiveSeed[] = [
  {
    testType: 'lineangle',
    configVersion: '1.0.0',
    name: 'Line Orientation Matching v1.0.0 (15° steps, 4 options, 30 trials)',
    status: 'DRAFT',
    engineVersion: '1.0.0',
    scoringVersion: '1.0.0',
    config: { totalTrials: 30, angleStepDeg: 15, optionCount: 4, minAngleSepSteps: 2, fixationMs: 500, timeoutMs: 8000, validRtFloorMs: 300, report: SIMULATED_REPORT_V1 },
  },
]

seeds.push({ ...seeds[0], name: '无向线段匹配 v2（15°，4选项，30次）', configVersion: '2.0.0', engineVersion: '2.0.0', scoringVersion: '2.0.0', config: { ...seeds[0].config, report: { reportVersion: '2.0.0', referenceMode: 'none' } } })
