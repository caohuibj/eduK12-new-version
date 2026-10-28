import type { CognitiveSeed } from '../../task-seed.types'

const SIMULATED_REPORT_V1 = {
  reportVersion: '1.0.0',
  referenceMode: 'simulated' as const,
  referenceVersion: 'sim-k12-v0.1',
  referenceBand: 'K7-9',
}

const SYMBOL_DIGIT_MAP = [['●', 1], ['■', 2], ['▲', 3], ['◆', 4], ['★', 5]] as Array<[string, number]>

export const seeds: CognitiveSeed[] = [
  {
    testType: 'symbolmatch',
    configVersion: '1.0.0',
    name: 'Symbol-Digit Matching v1.0.0 (5-pair map, 40 trials)',
    status: 'PUBLISHED',
    engineVersion: '1.0.0',
    scoringVersion: '1.0.0',
    config: { totalTrials: 40, symbolDigitMap: SYMBOL_DIGIT_MAP, fixationMs: 400, timeoutMs: 8000, validRtFloorMs: 250, report: SIMULATED_REPORT_V1 },
  },
]
