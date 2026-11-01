import type { CognitiveSeed } from '../../task-seed.types'

const NO_REFERENCE_REPORT = {
  reportVersion: '1.0.1',
  referenceMode: 'none' as const,
}

export const seeds: CognitiveSeed[] = [
  {
    testType: 'arithverify',
    configVersion: '1.0.1',
    name: 'Addition Verification v1.0.1 (operand 1-10)',
    status: 'DRAFT',
    engineVersion: '1.0.1',
    scoringVersion: '1.0.0',
    config: { totalTrials: 30, operandMax: 10, trueRatio: 0.5, fixationMs: 500, timeoutMs: 6000, validRtFloorMs: 200, report: NO_REFERENCE_REPORT },
  },
]
