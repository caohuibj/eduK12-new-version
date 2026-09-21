import { flankerConfigSchema } from '../../schemas/flanker.config'
import { flankerTrialSchema } from '../../schemas/flanker.trial'
import { scoreFlankerV1 } from '../../scoring/flanker.v1'
import { fixedCountFinalSubmission } from '../../v2/final-submission-budget'
import { defineCognitiveTaskPackage } from '../task-package'
import { flankerRegistryMeta } from './definitions'

const flankerFinalSubmission = fixedCountFinalSubmission('totalTrials')

export const flankerTaskPackage = defineCognitiveTaskPackage({
  testType: 'flanker',
  protocolPhases: [
    { key: 'test', persists: true, required: true },
  ],
  qualityEffects: {
    constantResponse: 'limited',
    excessiveOmissions: 'limited',
    insufficientCongruentTrials: 'limited',
    insufficientIncongruentTrials: 'limited',
    interpretable: 'none',
    interrupted: 'limited',
    lowAccuracy: 'limited',
  },
  entries: [
  {
  testType: 'flanker',
  engineVersion: '1.0.0',
  scoringVersion: '1.0.0',
  configSchema: flankerConfigSchema,
  trialSchema: flankerTrialSchema,
  finalSubmission: flankerFinalSubmission,
  score: scoreFlankerV1,
  ...flankerRegistryMeta,
}
  ],
})
