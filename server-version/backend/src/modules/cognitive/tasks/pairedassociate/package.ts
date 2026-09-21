import { executionSemantics } from './semantics'
import type { RegistryEntry } from '../../cognitive.types'
import { pairedassociateConfigSchema } from '../../schemas/pairedassociate.config'
import { pairedassociateTrialSchema } from '../../schemas/pairedassociate.trial'
import { scorePairedassociateV1 } from '../../scoring/pairedassociate.v1'
import {
  absoluteFallbackFinalSubmission,
  fixedCountFinalSubmission,
  nbackTaskCountFinalSubmission,
  phaseTaskCountFinalSubmission,
  spanTaskCountFinalSubmission,
  trailmakingTaskCountFinalSubmission,
} from '../../v2/final-submission-budget'
import { pairedassociateRegistryMeta } from './definitions'

const pairedassociateFinalSubmission = phaseTaskCountFinalSubmission()

export const executionEntries = [
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
].map((entry, index) => ({ ...entry, executionSemantics: executionSemantics[index] })) as unknown as RegistryEntry<unknown, unknown>[]
