import type { CognitiveSeed } from '../../task-seed.types'
const SIMULATED_REPORT_V1 = {
  reportVersion: '1.0.0',
  referenceMode: 'simulated' as const,
  referenceVersion: 'sim-k12-v0.1',
  referenceBand: 'K7-9',
}
const SIMULATED_REPORT_V2 = {
  reportVersion: '1.1.0',
  referenceMode: 'simulated' as const,
  referenceVersion: 'lit-sim-k12-v0.2',
  referenceBand: 'K7-9',
}
const NO_REFERENCE_REPORT = {
  reportVersion: '1.0.0',
  referenceMode: 'none' as const,
}
export const seeds: CognitiveSeed[] = [
{
    testType: 'stroop',
    configVersion: '1.0.1',
    name: 'Color-Word Stroop v1.0.1 [INTERNAL PILOT]',
    status: 'PUBLISHED',
    engineVersion: '1.0.0',
    scoringVersion: '1.0.0',
    config: { totalTrials: 24, congruentRatio: 0.5, fixationMs: 500, stimulusDurationMs: 2000, isiMs: 500, validRtFloorMs: 200, report: SIMULATED_REPORT_V1 },
  },
{
    testType: 'stroop',
    configVersion: '1.1.0',
    name: 'Color-Word Stroop v1.1.0',
    status: 'PUBLISHED',
    engineVersion: '1.0.0',
    scoringVersion: '1.1.0',
    config: { totalTrials: 40, congruentRatio: 0.5, fixationMs: 500, stimulusDurationMs: 2000, isiMs: 500, validRtFloorMs: 200, report: SIMULATED_REPORT_V2 },
  }
]
