import { pairedassociateConfigSchema } from '../../schemas/pairedassociate.config'
import { pairedassociateTrialSchema } from '../../schemas/pairedassociate.trial'
import { scorePairedassociateV1 } from '../../scoring/pairedassociate.v1'
import { phaseTaskCountFinalSubmission } from '../../v2/final-submission-budget'
import { defineCognitiveTaskPackage } from '../task-package'
import { pairedassociateRegistryMeta } from './definitions'

const pairedassociateFinalSubmission = phaseTaskCountFinalSubmission()

export const pairedassociateTaskPackage = defineCognitiveTaskPackage({
  testType: 'pairedassociate',
  protocolPhases: [
    { key: 'learning', persists: true, required: true },
    { key: 'delayed', persists: true, required: false },
  ],
  qualityEffects: {
    constantPositionResponse: 'limited',
    delayedStageIncomplete: 'limited',
    excessiveOmissions: 'limited',
    interpretable: 'none',
    interrupted: 'limited',
  },
  entries: [
  {
  testType: 'pairedassociate',
  engineVersion: '1.0.0',
  scoringVersion: '1.0.0',
  configSchema: pairedassociateConfigSchema,
  trialSchema: pairedassociateTrialSchema,
  finalSubmission: pairedassociateFinalSubmission,
  score: scorePairedassociateV1,
  ...pairedassociateRegistryMeta,
}
  ],
})
