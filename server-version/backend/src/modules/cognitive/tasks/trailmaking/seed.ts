import {
  NO_REFERENCE_REPORT,
  SIMULATED_REPORT_V1,
  SIMULATED_REPORT_V2,
  type CognitiveTaskSeedDeclarationV1,
} from '../task-seed'

export const trailmakingSeedDeclarations = [
  {
    testType: 'trailmaking',
    configVersion: '1.0.0',
    name: 'Trail Making Pilot v1.0.0',
    status: 'DRAFT',
    engineVersion: '1.0.0',
    scoringVersion: '1.0.0',
    config: { form: 'AB', partAItemCount: 12, partBItemCount: 12, stepTimeoutMs: 15000, stimulusSetVersion: 'trailmaking-generated-v1.0.0', report: NO_REFERENCE_REPORT },
  },
] satisfies CognitiveTaskSeedDeclarationV1[]
