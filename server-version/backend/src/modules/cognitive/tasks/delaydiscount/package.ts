import { executionSemantics } from './semantics'
import type { RegistryEntry, FinalSubmissionDefinition } from '../../cognitive.types'
import { delaydiscountConfigSchema } from '../../schemas/delaydiscount.config'
import { delaydiscountTrialSchema } from '../../schemas/delaydiscount.trial'
import { scoreDelaydiscountV1 } from '../../scoring/delaydiscount.v1'
import { delaydiscountRegistryMeta } from './definitions'

/** 计划试次数 = 延迟带数 × 每带二分步数；FINAL 预算由 config 权威推导。 */
const delaydiscountFinalSubmission: FinalSubmissionDefinition<unknown> = {
  maxTrials: (config) => {
    const record = config as Record<string, unknown>
    const bands = record?.delayBands
    const steps = record?.bisectionSteps
    if (!Array.isArray(bands) || !bands.every((band) => typeof band === 'number' && Number.isSafeInteger(band) && band > 0)) {
      throw new Error('delaydiscount FINAL budget requires an integer delayBands array')
    }
    if (typeof steps !== 'number' || !Number.isSafeInteger(steps) || steps <= 0) {
      throw new Error('delaydiscount FINAL budget requires a positive bisectionSteps integer')
    }
    return bands.length * steps
  },
}

export const executionEntries = [
  {
    testType: 'delaydiscount',
    engineVersion: '1.0.1',
    scoringVersion: '1.0.0',
    configSchema: delaydiscountConfigSchema,
    trialSchema: delaydiscountTrialSchema,
    finalSubmission: delaydiscountFinalSubmission,
    score: scoreDelaydiscountV1,
    ...delaydiscountRegistryMeta,
  },
].map((entry, index) => ({ ...entry, executionSemantics: executionSemantics[index] })) as unknown as RegistryEntry<unknown, unknown>[]
