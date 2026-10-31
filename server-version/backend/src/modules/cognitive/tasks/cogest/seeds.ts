import type { CognitiveSeed } from '../../task-seed.types'

const SIMULATED_REPORT_V1 = {
  reportVersion: '1.0.0',
  referenceMode: 'simulated' as const,
  referenceVersion: 'sim-k12-v0.1',
  referenceBand: 'K7-9',
}

export const seeds: CognitiveSeed[] = [
  {
    testType: 'cogest',
    configVersion: '1.0.0',
    name: 'Logical Deduction (Chinese) v1.0.0 (18 of 24 items)',
    status: 'DRAFT',
    engineVersion: '1.0.0',
    scoringVersion: '1.0.0',
    config: { totalTrials: 18, stimulusSetVersion: 'cogest-zh-v1.0.0', fixationMs: 400, timeoutMs: 15000, validRtFloorMs: 300, report: SIMULATED_REPORT_V1 },
  },
]

seeds.push({ testType: 'cogest', configVersion: '1.1.0', name: 'Cogest 1.1.0 HOLD · 20 candidate items; 30/36 unsupported', status: 'DRAFT', engineVersion: '1.1.0', scoringVersion: '1.1.0', config: {totalTrials:18, stimulusSetVersion:'cogest-zh-v1.1.0',fixationMs:400,timeoutMs:15000,validRtFloorMs:300,report:{reportVersion:'1.1.0',referenceMode:'none'}} })
