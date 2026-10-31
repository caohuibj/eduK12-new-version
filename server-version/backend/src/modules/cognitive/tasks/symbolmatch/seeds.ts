import type { CognitiveSeed } from '../../task-seed.types'

const NO_REFERENCE_REPORT = {
  reportVersion: '1.0.1',
  referenceMode: 'none' as const,
}

const SYMBOL_DIGIT_MAP = [['●', 1], ['■', 2], ['▲', 3], ['◆', 4], ['★', 5]] as Array<[string, number]>

export const seeds: CognitiveSeed[] = [
  {
    testType: 'symbolmatch',
    configVersion: '1.0.1',
    name: 'Symbol-Digit Matching v1.0.1 (5-pair map, 40 trials)',
    status: 'DRAFT',
    engineVersion: '1.0.1',
    scoringVersion: '1.0.0',
    config: { totalTrials: 40, symbolDigitMap: SYMBOL_DIGIT_MAP, fixationMs: 400, timeoutMs: 8000, validRtFloorMs: 250, report: NO_REFERENCE_REPORT },
  },
]
