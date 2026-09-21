import { fakeConfigSchema } from '../../schemas/fake.config'
import { fakeTrialSchema } from '../../schemas/fake.trial'
import { scoreFakeV1 } from '../../scoring/fake.v1'
import { fixedCountFinalSubmission } from '../../v2/final-submission-budget'
import { defineCognitiveTaskPackage } from '../task-package'
import { fakeRegistryMeta } from './definitions'

const fakeFinalSubmission = fixedCountFinalSubmission('trialCount')

export const fakeTaskPackage = defineCognitiveTaskPackage({
  testType: 'fake',
  entries: [
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
  ],
})
