import {
  NO_REFERENCE_REPORT,
  SIMULATED_REPORT_V1,
  SIMULATED_REPORT_V2,
  type CognitiveTaskSeedDeclarationV1,
} from '../task-seed'

export const lexicaldecisionSeedDeclarations = [
  {
    testType: 'lexicaldecision',
    configVersion: '1.0.0',
    name: 'Chinese Lexical Decision Pilot v1.0.0',
    status: 'DRAFT',
    engineVersion: '1.0.0',
    scoringVersion: '1.0.0',
    config: { totalTrials: 100, realWordRatio: 0.5, stimulusMs: 1200, trialTimeoutMs: 3000, isiMs: 300, validRtFloorMs: 150, stimulusSetVersion: 'zh-lexical-v1.0.0', pseudowordGeneratorVersion: 'zh-pseudoword-generator-v1.0.0', report: NO_REFERENCE_REPORT },
  },
] satisfies CognitiveTaskSeedDeclarationV1[]
