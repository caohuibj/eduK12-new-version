import type { CognitiveSeed } from '../../task-seed.types'

const SIMULATED_REPORT_V1 = {
  reportVersion: '1.0.0',
  referenceMode: 'simulated' as const,
  referenceVersion: 'sim-k12-v0.1',
  referenceBand: 'K7-9',
}

export const seeds: CognitiveSeed[] = [
  {
    testType: 'arithverify',
    configVersion: '1.0.0',
    name: 'Addition Verification v1.0.0 (operand 1-10)',
    status: 'PUBLISHED',
    engineVersion: '1.0.0',
    scoringVersion: '1.0.0',
    config: { totalTrials: 30, operandMax: 10, trueRatio: 0.5, fixationMs: 500, timeoutMs: 6000, validRtFloorMs: 200, report: SIMULATED_REPORT_V1 },
  },
]
