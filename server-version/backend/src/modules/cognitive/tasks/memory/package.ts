import { executionSemantics } from './semantics'
import type { RegistryEntry } from '../../cognitive.types'
import { memoryConfigSchema } from '../../schemas/memory.config'
import { memoryTrialSchema } from '../../schemas/memory.trial'
import { scoreMemoryV1 } from '../../scoring/memory.v1'
import { scoreMemoryV1_1 } from '../../scoring/memory.v1_1'
import { spanTaskCountFinalSubmission } from '../../v2/final-submission-budget'
import { memoryRegistryMeta, memoryRegistryMetaV11 } from './definitions'

const memoryFinalSubmission = spanTaskCountFinalSubmission('startLength', 'maxLength', 'trialsPerLevel')

export const executionEntries = [
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
].map((entry, index) => ({ ...entry, executionSemantics: executionSemantics[index] })) as unknown as RegistryEntry<unknown, unknown>[]
