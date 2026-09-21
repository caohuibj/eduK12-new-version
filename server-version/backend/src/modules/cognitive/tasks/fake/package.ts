import type { RegistryEntry } from '../../cognitive.types'
import { fakeConfigSchema } from '../../schemas/fake.config'
import { fakeTrialSchema } from '../../schemas/fake.trial'
import { scoreFakeV1 } from '../../scoring/fake.v1'
import {
  absoluteFallbackFinalSubmission,
  fixedCountFinalSubmission,
  nbackTaskCountFinalSubmission,
  phaseTaskCountFinalSubmission,
  spanTaskCountFinalSubmission,
  trailmakingTaskCountFinalSubmission,
} from '../../v2/final-submission-budget'
import { fakeRegistryMeta } from './definitions'

const fakeFinalSubmission = fixedCountFinalSubmission('trialCount')

export const executionEntries = [
{
  testType: 'fake',
  engineVersion: '1.0.0',
  scoringVersion: '1.0.0',
  configSchema: fakeConfigSchema,
  trialSchema: fakeTrialSchema,
  finalSubmission: fakeFinalSubmission,
  score: scoreFakeV1,
  ...fakeRegistryMeta,
}
] as unknown as RegistryEntry<unknown, unknown>[]
