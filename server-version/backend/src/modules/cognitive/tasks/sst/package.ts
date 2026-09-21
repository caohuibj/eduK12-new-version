import { sstConfigSchema } from '../../schemas/sst.config'
import { sstTrialSchema } from '../../schemas/sst.trial'
import { scoreSstV1 } from '../../scoring/sst.v1'
import { fixedCountFinalSubmission } from '../../v2/final-submission-budget'
import { defineCognitiveTaskPackage } from '../task-package'
import { sstRegistryMeta } from './definitions'

const sstFinalSubmission = fixedCountFinalSubmission('totalTrials')

export const sstTaskPackage = defineCognitiveTaskPackage({
  testType: 'sst',
  protocolPhases: [
    { key: 'test', persists: true, required: true },
  ],
  qualityEffects: {
    highGoOmission: 'limited',
    insufficientStopTrials: 'limited',
    interpretable: 'none',
    interrupted: 'limited',
    pRespondStopOutOfRange: 'limited',
    strategicSlowingSuspected: 'limited',
  },
  entries: [
  {
  testType: 'sst',
  engineVersion: '1.0.0',
  scoringVersion: '1.0.0',
  configSchema: sstConfigSchema,
  trialSchema: sstTrialSchema,
  finalSubmission: sstFinalSubmission,
  score: scoreSstV1,
  ...sstRegistryMeta,
}
  ],
})
