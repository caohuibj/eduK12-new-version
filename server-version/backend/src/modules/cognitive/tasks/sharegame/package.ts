import { executionSemantics } from './semantics'
import type { RegistryEntry, FinalSubmissionDefinition } from '../../cognitive.types'
import { sharegameConfigSchema } from '../../schemas/sharegame.config'
import { sharegameTrialSchema } from '../../schemas/sharegame.trial'
import { scoreSharegameV1 } from '../../scoring/sharegame.v1'
import { sharegameRegistryMeta } from './definitions'

/** 计划轮次 = 冻结禀赋序列长度。 */
const sharegameFinalSubmission: FinalSubmissionDefinition<unknown> = {
  maxTrials: (config) => {
    const endowments = (config as Record<string, unknown> | null)?.endowments
    if (!Array.isArray(endowments) || !endowments.every((value) => typeof value === 'number' && Number.isSafeInteger(value) && value > 0)) {
      throw new Error('sharegame FINAL budget requires a positive integer endowments array')
    }
    return endowments.length
  },
}

export const executionEntries = [
  {
    testType: 'sharegame',
    engineVersion: '1.0.0',
    scoringVersion: '1.0.0',
    configSchema: sharegameConfigSchema,
    trialSchema: sharegameTrialSchema,
    finalSubmission: sharegameFinalSubmission,
    score: scoreSharegameV1,
    ...sharegameRegistryMeta,
  },
].map((entry, index) => ({ ...entry, executionSemantics: executionSemantics[index] })) as unknown as RegistryEntry<unknown, unknown>[]
