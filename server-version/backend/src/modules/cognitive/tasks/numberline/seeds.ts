import type { CognitiveSeed } from '../../task-seed.types'
import { NUMBERLINE_NP_STIMULUS_VERSION } from './np-generator'

const NO_REFERENCE_REPORT = {
  reportVersion: '1.0.1',
  referenceMode: 'none' as const,
}

export const seeds: CognitiveSeed[] = [
  {
    testType: 'numberline',
    configVersion: '1.0.1',
    name: 'Number Line Estimation 0-100 v1.0.1',
    status: 'DRAFT',
    engineVersion: '1.0.1',
    scoringVersion: '1.0.0',
    config: { totalTrials: 20, lineMax: 100, maxResponseMs: 10000, validRtFloorMs: 300, report: NO_REFERENCE_REPORT },
  },
]

// Each range/set/deadline is a separate immutable draft. No mixed-range platform or scheduler.
for (const lineMax of [100, 1000]) for (const targetSet of ['A', 'B']) for (const maxResponseMs of [4000, 30000]) {
  seeds.push({ testType: 'numberline', configVersion: `1.1.${seeds.length - 1}`, name: `NP ${lineMax} / ${targetSet} / ${maxResponseMs / 1000}s`, status: 'DRAFT', engineVersion: '1.1.0', scoringVersion: '1.1.0', config: { totalTrials: 6, lineMax, targetSet, maxResponseMs, stimulusSetVersion: NUMBERLINE_NP_STIMULUS_VERSION, validRtFloorMs: 300, report: { reportVersion: '1.1.0', referenceMode: 'none' } } })
}
