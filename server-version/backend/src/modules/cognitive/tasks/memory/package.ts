import { memoryConfigSchema } from '../../schemas/memory.config'
import { memoryTrialSchema } from '../../schemas/memory.trial'
import { scoreMemoryV1 } from '../../scoring/memory.v1'
import { scoreMemoryV1_1 } from '../../scoring/memory.v1_1'
import { spanTaskCountFinalSubmission } from '../../v2/final-submission-budget'
import { defineCognitiveTaskPackage } from '../task-package'
import { memoryRegistryMeta, memoryRegistryMetaV11 } from './definitions'

const memoryFinalSubmission = spanTaskCountFinalSubmission('startLength', 'maxLength', 'trialsPerLevel')

export const memoryTaskPackage = defineCognitiveTaskPackage({
  testType: 'memory',
  entries: [
  {
  testType: 'memory',
  engineVersion: '1.0.0',
  scoringVersion: '1.0.0',
  configSchema: memoryConfigSchema,
  trialSchema: memoryTrialSchema,
  finalSubmission: memoryFinalSubmission,
  score: scoreMemoryV1,
  ...memoryRegistryMeta,
},
  {
  testType: 'memory',
  engineVersion: '1.0.0',
  scoringVersion: '1.1.0',
  configSchema: memoryConfigSchema,
  trialSchema: memoryTrialSchema,
  finalSubmission: memoryFinalSubmission,
  score: scoreMemoryV1_1,
  ...memoryRegistryMetaV11,
}
  ],
})
