import {
  NO_REFERENCE_REPORT,
  SIMULATED_REPORT_V1,
  SIMULATED_REPORT_V2,
  type CognitiveTaskSeedDeclarationV1,
} from '../task-seed'

export const taskswitchSeedDeclarations = [
  {
    testType: 'taskswitch',
    configVersion: '1.0.0',
    name: 'Task Switching v1.0.0',
    status: 'PUBLISHED',
    engineVersion: '1.0.0',
    scoringVersion: '1.0.0',
    config: { totalTrials: 128, switchRatio: 0.5, blockCount: 4, includePureBlocks: false, cueMs: 400, stimulusMs: 2000, isiMs: 400, validRtFloorMs: 200, report: NO_REFERENCE_REPORT },
  },
] satisfies CognitiveTaskSeedDeclarationV1[]
