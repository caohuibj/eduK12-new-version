import type { CognitiveSeed } from '../../task-seed.types'

const SIMULATED_REPORT_V1 = {
  reportVersion: '1.0.0',
  referenceMode: 'simulated' as const,
  referenceVersion: 'sim-k12-v0.1',
  referenceBand: 'K7-9',
}

export const seeds: CognitiveSeed[] = [
  {
    testType: 'icarmatrix',
    configVersion: '1.0.0',
    name: 'ICAR-style Matrix Reasoning v1.0.0 (8 bank + 8 generated)',
    status: 'DRAFT',
    engineVersion: '1.0.0',
    scoringVersion: '1.0.0',
    config: { totalTrials: 16, stimulusSetVersion: 'icarmatrix-gen-v1.0.0', fixationMs: 400, timeoutMs: 30000, validRtFloorMs: 500, report: SIMULATED_REPORT_V1 },
  },
  {
    testType: 'icarmatrix',
    configVersion: '1.0.0-child',
    name: 'Matrix v2 child (2x2, 6 trials)',
    status: 'DRAFT',
    engineVersion: '2.0.0',
    scoringVersion: '1.0.0',
    config: { totalTrials: 6, matrixType: '2x2', stimulusSetVersion: 'matgen-bank-v1.0.0', fixationMs: 400, timeoutMs: 30000, validRtFloorMs: 500, report: SIMULATED_REPORT_V1 },
  },
  {
    testType: 'icarmatrix',
    configVersion: '1.0.0-adolescent',
    name: 'Matrix v2 adolescent (3x3, 8 trials)',
    status: 'DRAFT',
    engineVersion: '2.0.0',
    scoringVersion: '1.0.0',
    config: { totalTrials: 8, matrixType: '3x3', stimulusSetVersion: 'matgen-bank-v1.0.0', fixationMs: 400, timeoutMs: 30000, validRtFloorMs: 500, report: SIMULATED_REPORT_V1 },
  },
  {
    testType: 'icarmatrix',
    configVersion: '1.0.0-adult',
    name: 'Matrix v2 adult (3x3, 8 trials)',
    status: 'DRAFT',
    engineVersion: '2.0.0',
    scoringVersion: '1.0.0',
    config: { totalTrials: 8, matrixType: '3x3', stimulusSetVersion: 'matgen-bank-v1.0.0', fixationMs: 400, timeoutMs: 30000, validRtFloorMs: 500, report: SIMULATED_REPORT_V1 },
  },
  {
    testType: 'icarmatrix', configVersion: '2.1.0', name: 'Matrix reviewed seven-item pilot (6 trials)',
    status: 'DRAFT', engineVersion: '2.1.0', scoringVersion: '1.1.0',
    config: { totalTrials: 6, matrixType: '3x3', stimulusSetVersion: 'matgen-reviewed-v1.0.0', fixationMs: 400, timeoutMs: 30000, validRtFloorMs: 500, report: { reportVersion: '1.1.0', referenceMode: 'none' } },
  },
]
