import { executionSemantics } from './semantics'
import type { RegistryEntry, FinalSubmissionDefinition } from '../../cognitive.types'
import { trustgameConfigSchema } from '../../schemas/trustgame.config'
import { trustgameTrialSchema } from '../../schemas/trustgame.trial'
import { scoreTrustgameV1 } from '../../scoring/trustgame.v1'
import { trustgameRegistryMeta } from './definitions'

/** 计划轮次 = 冻结提议序列长度。 */
const trustgameFinalSubmission: FinalSubmissionDefinition<unknown> = {
  maxTrials: (config) => {
    const offers = (config as Record<string, unknown> | null)?.offers
    if (!Array.isArray(offers) || !offers.every((offer) => typeof offer === 'number' && Number.isSafeInteger(offer) && offer > 0)) {
      throw new Error('trustgame FINAL budget requires a positive integer offers array')
    }
    return offers.length
  },
}

export const executionEntries = [
  {
    testType: 'trustgame',
    engineVersion: '1.0.1',
    scoringVersion: '1.0.0',
    configSchema: trustgameConfigSchema,
    trialSchema: trustgameTrialSchema,
    finalSubmission: trustgameFinalSubmission,
    score: scoreTrustgameV1,
    ...trustgameRegistryMeta,
  },
].map((entry, index) => ({ ...entry, executionSemantics: executionSemantics[index] })) as unknown as RegistryEntry<unknown, unknown>[]
