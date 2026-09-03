/**
 * Pure mental-health-rule-v1 engine.
 * FACET lives only on MentalHealthRuleBinding / rule-set tiers — never Evidence.role.
 * First production Bundles keep productionTriggerEnabled=false so SAFETY never fires.
 * Low WHO-5/SDQ/TEXI/ADEXI scores are never treated as crisis by themselves.
 */

import type {
  BundleAnalysisEngineV1,
  BundleEngineInputV1,
  BundleEngineResultV1,
} from '../registry'
import { bundleContractFail } from '../errors'
import type {
  EvidenceItemV1,
  EvidenceQualityStateV1,
  MentalHealthRuleBindingV1,
  MentalHealthRuleTierV1,
} from '../types'

export const MENTAL_HEALTH_RULE_ENGINE_KEY = 'mental-health-rule-v1' as const
export const MENTAL_HEALTH_RULE_ENGINE_VERSION = '1.0.0' as const
export const MENTAL_HEALTH_RULE_PAYLOAD_SCHEMA = 'mental-health-rule-payload-v1' as const
export const MENTAL_HEALTH_FEEDBACK_VERSION = '1.0.0' as const

export type MentalHealthOutcomeCodeV1 =
  | 'LOW_CONCERN'
  | 'MIXED_RESULTS'
  | 'CONSISTENT_SIGNAL'
  | 'INSUFFICIENT_QUALITY'
  | 'SAFETY_ESCALATED'

export type MentalHealthActionTierV1 =
  | 'NONE'
  | 'OBSERVE'
  | 'DISCUSS'
  | 'FOLLOW_UP'
  | 'SAFETY_ESCALATION'

export interface MentalHealthFeedbackBlockV1 {
  key: string
  version: string
  text: string
}

export interface MentalHealthCoreRuleV1 {
  ruleId: string
  ruleVersion: string
  requiredEvidence: Array<{
    evidenceKey: string
    criterionBandKey: string
  }>
  outcomeCode: Exclude<MentalHealthOutcomeCodeV1, 'MIXED_RESULTS' | 'INSUFFICIENT_QUALITY' | 'SAFETY_ESCALATED'>
  actionTier: Exclude<MentalHealthActionTierV1, 'SAFETY_ESCALATION'>
  feedbackBlockKey: string
}

export interface MentalHealthDetailRuleV1 {
  ruleId: string
  ruleVersion: string
  /** FACET or CONTEXT — not an Evidence.role. */
  tier: Extract<MentalHealthRuleTierV1, 'FACET' | 'CONTEXT'>
  evidenceKey: string
  feedbackBlockKey: string
}

export interface MentalHealthSafetyRuleV1 {
  ruleId: string
  ruleVersion: string
  evidenceKey: string
  triggerBandKeys: string[]
  feedbackBlockKey: string
}

/**
 * Versioned rule + feedback contract consumed only by this engine.
 * Not a product Package definition — callers supply the frozen rule set.
 */
export interface MentalHealthRuleSetV1 {
  ruleSetKey: string
  ruleSetVersion: string
  feedbackVersion: string
  coreRules: MentalHealthCoreRuleV1[]
  facetRules: MentalHealthDetailRuleV1[]
  contextRules: MentalHealthDetailRuleV1[]
  safetyRules: MentalHealthSafetyRuleV1[]
  feedbackBlocks: MentalHealthFeedbackBlockV1[]
}

export interface MentalHealthRulePayloadV1 {
  schema: typeof MENTAL_HEALTH_RULE_PAYLOAD_SCHEMA
  ruleSetKey: string
  ruleSetVersion: string
  feedbackVersion: string
  outcomeCode: MentalHealthOutcomeCodeV1
  actionTier: MentalHealthActionTierV1
  core: {
    matched: boolean
    ruleId: string | null
    ruleVersion: string | null
    feedbackBlockKey: string | null
  }
  facetFindings: Array<{
    ruleId: string
    tier: 'FACET'
    evidenceKey: string
    available: boolean
    feedbackBlockKey: string | null
  }>
  contextFindings: Array<{
    ruleId: string
    tier: 'CONTEXT'
    evidenceKey: string
    available: boolean
    feedbackBlockKey: string | null
  }>
  safetySignals: Array<{
    ruleId: string
    evidenceKey: string
    active: boolean
    criterionBandKey: string | null
  }>
  ruleBindings: MentalHealthRuleBindingV1[]
  feedbackTexts: string[]
  limitations: string[]
  /** Always false for first production Bundles (productionTriggerEnabled=false). */
  safetyTriggered: boolean
}

const usableEvidence = (item: EvidenceItemV1 | undefined): item is EvidenceItemV1 => (
  Boolean(
    item
    && item.quality === 'interpretable'
    && item.value.state === 'present'
    && item.criterionBandKey,
  )
)

const feedbackText = (
  ruleSet: MentalHealthRuleSetV1,
  key: string | null,
): string | null => {
  if (!key) return null
  const block = ruleSet.feedbackBlocks.find((entry) => entry.key === key)
  return block?.text ?? null
}

const validateRuleSet = (ruleSet: MentalHealthRuleSetV1): void => {
  if (!ruleSet.ruleSetKey || !ruleSet.ruleSetVersion || !ruleSet.feedbackVersion) {
    bundleContractFail('RULE_SET_INVALID', 'mental-health ruleSet identity 缺失')
  }
  const ruleIds = new Set<string>()
  for (const rule of [
    ...ruleSet.coreRules,
    ...ruleSet.facetRules,
    ...ruleSet.contextRules,
    ...ruleSet.safetyRules,
  ]) {
    if (ruleIds.has(rule.ruleId)) {
      bundleContractFail('RULE_SET_INVALID', `ruleId 重复: ${rule.ruleId}`)
    }
    ruleIds.add(rule.ruleId)
  }
  for (const rule of ruleSet.facetRules) {
    if (rule.tier !== 'FACET') {
      bundleContractFail('RULE_SET_INVALID', `facetRules 必须使用 FACET tier: ${rule.ruleId}`)
    }
  }
  for (const rule of ruleSet.contextRules) {
    if (rule.tier !== 'CONTEXT') {
      bundleContractFail('RULE_SET_INVALID', `contextRules 必须使用 CONTEXT tier: ${rule.ruleId}`)
    }
  }
}

const evidenceByKey = (evidence: EvidenceItemV1[]): Map<string, EvidenceItemV1> => {
  const map = new Map<string, EvidenceItemV1>()
  for (const item of evidence) {
    if (map.has(item.evidenceKey)) {
      bundleContractFail('EVIDENCE_SOURCE_SHAPE', `重复 evidenceKey: ${item.evidenceKey}`)
    }
    map.set(item.evidenceKey, item)
  }
  return map
}

const matchCoreRule = (
  rules: MentalHealthCoreRuleV1[],
  byKey: Map<string, EvidenceItemV1>,
): MentalHealthCoreRuleV1 | null => (
  rules.find((rule) => rule.requiredEvidence.every((required) => {
    const item = byKey.get(required.evidenceKey)
    return usableEvidence(item) && item.criterionBandKey === required.criterionBandKey
  })) ?? null
)

const primaryCoreKeys = (ruleSet: MentalHealthRuleSetV1): string[] => (
  [...new Set(ruleSet.coreRules.flatMap((rule) => rule.requiredEvidence.map((entry) => entry.evidenceKey)))]
)

const buildPayload = (input: BundleEngineInputV1): MentalHealthRulePayloadV1 => {
  const ruleSet = input.ruleSet
  if (!ruleSet) {
    return bundleContractFail('RULE_SET_REQUIRED', 'mental-health-rule-v1 需要冻结 ruleSet')
  }
  validateRuleSet(ruleSet)

  const byKey = evidenceByKey(input.evidence)
  const productionSafetyEnabled = input.snapshot.bundleDefinition.safetyCapability.productionTriggerEnabled === true

  const safetySignals = ruleSet.safetyRules.map((rule) => {
    const item = byKey.get(rule.evidenceKey)
    const band = item?.criterionBandKey ?? null
    const roleOk = item?.role === 'SAFETY'
    const bandHit = Boolean(band && rule.triggerBandKeys.includes(band))
    const active = Boolean(
      productionSafetyEnabled
      && roleOk
      && usableEvidence(item)
      && bandHit,
    )
    return {
      ruleId: rule.ruleId,
      evidenceKey: rule.evidenceKey,
      active,
      criterionBandKey: band,
    }
  })
  const activeSafety = safetySignals.some((signal) => signal.active)

  const requiredKeys = primaryCoreKeys(ruleSet)
  const primaryAvailable = requiredKeys.length === 0
    || requiredKeys.every((key) => usableEvidence(byKey.get(key)))

  const matchedRule = (!activeSafety && primaryAvailable)
    ? matchCoreRule(ruleSet.coreRules, byKey)
    : null

  let outcomeCode: MentalHealthOutcomeCodeV1
  let actionTier: MentalHealthActionTierV1
  let coreFeedbackKey: string | null = null

  if (activeSafety) {
    outcomeCode = 'SAFETY_ESCALATED'
    actionTier = 'SAFETY_ESCALATION'
  } else if (!primaryAvailable) {
    outcomeCode = 'INSUFFICIENT_QUALITY'
    actionTier = 'NONE'
  } else if (!matchedRule) {
    // Fail closed: no reviewed CORE combination matched.
    outcomeCode = 'MIXED_RESULTS'
    actionTier = 'DISCUSS'
  } else {
    outcomeCode = matchedRule.outcomeCode
    actionTier = matchedRule.actionTier
    coreFeedbackKey = matchedRule.feedbackBlockKey
  }

  const facetFindings = ruleSet.facetRules.map((rule) => {
    const available = usableEvidence(byKey.get(rule.evidenceKey))
    return {
      ruleId: rule.ruleId,
      tier: 'FACET' as const,
      evidenceKey: rule.evidenceKey,
      available,
      feedbackBlockKey: available ? rule.feedbackBlockKey : null,
    }
  })

  const contextFindings = ruleSet.contextRules.map((rule) => {
    const available = usableEvidence(byKey.get(rule.evidenceKey))
    return {
      ruleId: rule.ruleId,
      tier: 'CONTEXT' as const,
      evidenceKey: rule.evidenceKey,
      available,
      feedbackBlockKey: available ? rule.feedbackBlockKey : null,
    }
  })

  const ruleBindings: MentalHealthRuleBindingV1[] = [
    ...ruleSet.coreRules.flatMap((rule) => rule.requiredEvidence.map((entry) => ({
      evidenceKey: entry.evidenceKey,
      tier: 'CORE' as const,
    }))),
    ...ruleSet.facetRules.map((rule) => ({
      evidenceKey: rule.evidenceKey,
      tier: 'FACET' as const,
    })),
    ...ruleSet.contextRules.map((rule) => ({
      evidenceKey: rule.evidenceKey,
      tier: 'CONTEXT' as const,
    })),
    ...ruleSet.safetyRules.map((rule) => ({
      evidenceKey: rule.evidenceKey,
      tier: 'SAFETY' as const,
    })),
  ]

  const feedbackKeys = [
    coreFeedbackKey,
    ...facetFindings.map((row) => row.feedbackBlockKey),
    ...contextFindings.map((row) => row.feedbackBlockKey),
    ...(activeSafety
      ? safetySignals.filter((row) => row.active).map((row) => (
        ruleSet.safetyRules.find((rule) => rule.ruleId === row.ruleId)?.feedbackBlockKey ?? null
      ))
      : []),
  ]

  const feedbackTexts = [...new Set(
    feedbackKeys
      .map((key) => feedbackText(ruleSet, key))
      .filter((text): text is string => Boolean(text)),
  )]

  const limitations = [
    'mental-health-rule-v1：仅消费权威投影 Evidence/sources，不从显示标签推断分类。',
    '未命中已审核 CORE 规则时 fail-closed。',
    'WHO-5/SDQ/TEXI/ADEXI 低分不得自行解释为危机信号。',
  ]
  if (!productionSafetyEnabled) {
    limitations.push('productionTriggerEnabled=false：首版生产 Bundle 不触发 safety。')
  }
  if (outcomeCode === 'MIXED_RESULTS') {
    limitations.push('预先指定的 CORE 分类组合未命中，系统按 fail-closed 处理。')
  }

  return {
    schema: MENTAL_HEALTH_RULE_PAYLOAD_SCHEMA,
    ruleSetKey: ruleSet.ruleSetKey,
    ruleSetVersion: ruleSet.ruleSetVersion,
    feedbackVersion: ruleSet.feedbackVersion,
    outcomeCode,
    actionTier,
    core: {
      matched: Boolean(matchedRule),
      ruleId: matchedRule?.ruleId ?? null,
      ruleVersion: matchedRule?.ruleVersion ?? null,
      feedbackBlockKey: coreFeedbackKey,
    },
    facetFindings,
    contextFindings,
    safetySignals,
    ruleBindings,
    feedbackTexts,
    limitations,
    safetyTriggered: activeSafety,
  }
}

export const runMentalHealthRuleV1: BundleAnalysisEngineV1 = (
  input: BundleEngineInputV1,
): BundleEngineResultV1 => {
  const ref = input.snapshot.engine
  if (ref.key !== MENTAL_HEALTH_RULE_ENGINE_KEY || ref.version !== MENTAL_HEALTH_RULE_ENGINE_VERSION) {
    return {
      kind: 'UNAVAILABLE',
      reason: `engine ref mismatch: expected ${MENTAL_HEALTH_RULE_ENGINE_KEY}@${MENTAL_HEALTH_RULE_ENGINE_VERSION}`,
    }
  }
  return {
    kind: 'COMPUTED',
    payload: buildPayload(input),
  }
}

/** Test/helper: overall quality rollup without inventing bands. */
export const rollupEvidenceQuality = (
  evidence: EvidenceItemV1[],
): EvidenceQualityStateV1 => {
  if (evidence.some((item) => item.quality === 'invalid')) return 'invalid'
  if (evidence.some((item) => item.quality === 'unavailable')) return 'unavailable'
  if (evidence.some((item) => item.quality === 'limited')) return 'limited'
  if (evidence.length === 0) return 'unavailable'
  return 'interpretable'
}
