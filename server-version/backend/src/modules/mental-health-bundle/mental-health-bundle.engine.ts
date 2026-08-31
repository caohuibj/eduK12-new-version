import type { ScaleResultV2 } from '../scale/scale-result'
import type {
  BundleActionTier,
  BundleCoreRuleDefinition,
  BundleEvidenceFact,
  BundleEvidenceMappingDefinition,
  BundleEvidenceRole,
  BundleFindingFact,
  BundleOutcomeCode,
  BundleQualityState,
  BuildMentalHealthBundleAnalysisInput,
  FrozenBundleScaleEvidence,
  MentalHealthBundleAnalysisResult,
  MentalHealthBundleDefinition,
  BundleReportFacts,
} from './mental-health-bundle.types'
import {
  MENTAL_HEALTH_ANALYSIS_ENGINE_KEY,
  MENTAL_HEALTH_BUNDLE_ANALYSIS_VERSION,
  MENTAL_HEALTH_BUNDLE_EVIDENCE_MAPPING_VERSION,
  MENTAL_HEALTH_BUNDLE_FACTS_SCHEMA_VERSION,
  MENTAL_HEALTH_BUNDLE_REPORT_SCHEMA_VERSION,
} from './mental-health-bundle.types'

export class MentalHealthBundleInputError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MentalHealthBundleInputError'
  }
}

const fail = (message: string): never => {
  throw new MentalHealthBundleInputError(message)
}

const uniqueStrings = (values: string[]): string[] => [...new Set(values)]

const isRecord = (value: unknown): value is Record<string, unknown> => (
  Boolean(value && typeof value === 'object' && !Array.isArray(value))
)

const requiredString = (value: unknown, label: string): string => {
  if (typeof value !== 'string' || value.trim().length === 0) fail(`${label} 缺失`)
  return value as string
}

const qualityRank = (state: BundleQualityState): number => (
  state === 'invalid' ? 2 : state === 'limited' ? 1 : 0
)

const qualityStateFor = (result: FrozenBundleScaleEvidence): BundleQualityState => {
  if (result.qualityState !== 'interpretable' && result.qualityState !== 'limited' && result.qualityState !== 'invalid') {
    fail(`Bundle evidence qualityState 无效：${result.mappingKey}`)
  }
  if (result.scoreStatus === 'not_calculable' || result.value === null) return 'invalid'
  if (result.scoreStatus === 'limited') return 'limited'
  return result.qualityState
}

const validateDefinition = (bundle: MentalHealthBundleDefinition): void => {
  requiredString(bundle.key, 'Bundle key')
  requiredString(bundle.version, 'Bundle version')
  requiredString(bundle.ruleSetKey, 'Bundle ruleSetKey')
  requiredString(bundle.ruleSetVersion, 'Bundle ruleSetVersion')
  if (bundle.profiles.length === 0) fail('Bundle 没有可用 Profile')
  if (bundle.scaleSlots.length === 0) fail('Bundle 没有 Scale slot')
  const positions = new Set<number>()
  const slotKeys = new Set<string>()
  const mappingKeys = new Set<string>()
  for (const slot of bundle.scaleSlots) {
    requiredString(slot.key, 'Bundle Scale slot key')
    if (positions.has(slot.position)) fail(`Bundle slot position 重复：${slot.position}`)
    if (slotKeys.has(slot.key)) fail(`Bundle slot key 重复：${slot.key}`)
    positions.add(slot.position)
    slotKeys.add(slot.key)
    if (slot.mappings.length === 0) fail(`Bundle Scale slot 没有 evidence mapping：${slot.key}`)
    for (const mapping of slot.mappings) {
      requiredString(mapping.mappingKey, `Bundle mapping ${slot.key}/mappingKey`)
      requiredString(mapping.mappingVersion, `Bundle mapping ${mapping.mappingKey}/mappingVersion`)
      requiredString(mapping.scaleCode, `Bundle mapping ${mapping.mappingKey}/scaleCode`)
      requiredString(mapping.scoreKey, `Bundle mapping ${mapping.mappingKey}/scoreKey`)
      if (mappingKeys.has(mapping.mappingKey)) fail(`Bundle mapping key 重复：${mapping.mappingKey}`)
      mappingKeys.add(mapping.mappingKey)
      if (mapping.classificationCodes && new Set(mapping.classificationCodes).size !== mapping.classificationCodes.length) {
        fail(`Bundle mapping classification code 重复：${mapping.mappingKey}`)
      }
    }
  }
  const ruleIds = new Set<string>()
  for (const rule of bundle.coreRules) {
    requiredString(rule.ruleId, 'Bundle core ruleId')
    if (ruleIds.has(rule.ruleId)) fail(`Bundle ruleId 重复：${rule.ruleId}`)
    ruleIds.add(rule.ruleId)
    if (rule.requiredEvidence.length === 0) fail(`Bundle core rule 没有 required evidence：${rule.ruleId}`)
    for (const evidence of rule.requiredEvidence) {
      if (!mappingKeys.has(evidence.mappingKey)) fail(`Bundle core rule 引用了未知 mapping：${evidence.mappingKey}`)
    }
  }
  for (const rule of [...bundle.facetRules, ...bundle.contextRules]) {
    requiredString(rule.ruleId, 'Bundle detail ruleId')
    if (!mappingKeys.has(rule.mappingKey)) fail(`Bundle detail rule 引用了未知 mapping：${rule.mappingKey}`)
  }
}

const mappingIndexFor = (bundle: MentalHealthBundleDefinition): Map<string, BundleEvidenceMappingDefinition> => {
  const index = new Map<string, BundleEvidenceMappingDefinition>()
  for (const slot of bundle.scaleSlots) {
    for (const mapping of slot.mappings) index.set(mapping.mappingKey, mapping)
  }
  return index
}

const mappingSlotFor = (bundle: MentalHealthBundleDefinition): Map<string, string> => {
  const index = new Map<string, string>()
  for (const slot of bundle.scaleSlots) {
    for (const mapping of slot.mappings) index.set(mapping.mappingKey, slot.key)
  }
  return index
}

const coreEvidenceUsable = (
  evidence: BundleEvidenceFact | undefined,
  mapping: BundleEvidenceMappingDefinition | undefined,
): boolean => Boolean(
  evidence?.interpretable
  && evidence.scoreStatus === 'calculated'
  && evidence.classification
  && (!mapping?.classificationCodes || mapping.classificationCodes.includes(evidence.classification)),
)

const resultClassification = (result: ScaleResultV2, scoreKey: string): string | null => {
  const score = result.scores.find((candidate) => candidate.key === scoreKey)
  if (!score) return null
  const rawScore = score as unknown as Record<string, unknown>
  const directCandidates = [rawScore.classification, rawScore.classificationCode, rawScore.bandKey, rawScore.level]
  const direct = directCandidates.find((candidate): candidate is string => typeof candidate === 'string' && candidate.length > 0)
  if (direct) return direct

  const reference = result.references.find((candidate) => {
    if (!isRecord(candidate)) return false
    return candidate.scoreKey === scoreKey && candidate.status === 'available'
  }) as Record<string, unknown> | undefined
  const criterionBand = reference && isRecord(reference.criterionBand) ? reference.criterionBand : null
  const referenceCode = criterionBand && [criterionBand.key, criterionBand.code, criterionBand.classification]
    .find((candidate): candidate is string => typeof candidate === 'string' && candidate.length > 0)
  if (referenceCode) return referenceCode

  const interpretation = result.interpretations.find((candidate) => candidate.scoreKey === scoreKey)
  return interpretation?.label ?? null
}

/**
 * Convert an authoritative ScaleResultV2 into the Bundle evidence contract.
 * This adapter is deliberately score-key based: it never re-scores answers or
 * derives a new total from dimensions.
 */
export const extractBundleScaleEvidence = (input: {
  slotKey: string
  sourceResultId: string
  compositeItemId?: string | null
  scaleId: string
  result: ScaleResultV2
  profile: BuildMentalHealthBundleAnalysisInput['profile']
  mappings: BundleEvidenceMappingDefinition[]
  respondentType: string
}): FrozenBundleScaleEvidence[] => input.mappings.map((mapping) => {
  if (input.result.instrument.code !== mapping.scaleCode) {
    fail(`Bundle Scale code 与 mapping 不匹配：${input.slotKey}/${mapping.mappingKey}`)
  }
  const score = input.result.scores.find((candidate) => candidate.key === mapping.scoreKey)
  const qualityState: BundleQualityState = input.result.quality.status
  const scoreStatus = score?.status ?? 'not_calculable'
  const value = score?.value ?? null
  return {
    slotKey: input.slotKey,
    sourceResultId: input.sourceResultId,
    compositeItemId: input.compositeItemId ?? null,
    scaleId: input.scaleId,
    scaleCode: input.result.instrument.code,
    instrumentVersion: input.result.instrument.instrumentVersion,
    scoreKey: mapping.scoreKey,
    value,
    scoreStatus,
    classification: score ? resultClassification(input.result, mapping.scoreKey) : null,
    profile: input.profile,
    mappingKey: mapping.mappingKey,
    mappingVersion: mapping.mappingVersion,
    role: mapping.role,
    construct: mapping.construct,
    ...(mapping.facet ? { facet: mapping.facet } : {}),
    direction: mapping.direction,
    respondentType: input.respondentType,
    qualityState,
    qualityFlags: [...input.result.quality.flags],
    provenance: {
      sourceType: 'scale_assessment',
      sourceResultId: input.sourceResultId,
      scaleId: input.scaleId,
      scaleCode: input.result.instrument.code,
      instrumentVersion: input.result.instrument.instrumentVersion,
      scoreKey: mapping.scoreKey,
      mappingKey: mapping.mappingKey,
      mappingVersion: mapping.mappingVersion,
    },
  }
})

const placeholderFor = (
  mapping: BundleEvidenceMappingDefinition,
  slotKey: string,
  profile: BuildMentalHealthBundleAnalysisInput['profile'],
): FrozenBundleScaleEvidence => ({
  slotKey,
  sourceResultId: `missing:${mapping.mappingKey}`,
  compositeItemId: null,
  scaleId: 'missing',
  scaleCode: mapping.scaleCode,
  instrumentVersion: 'missing',
  scoreKey: mapping.scoreKey,
  value: null,
  scoreStatus: 'not_calculable',
  classification: null,
  profile,
  mappingKey: mapping.mappingKey,
  mappingVersion: mapping.mappingVersion,
  role: mapping.role,
  construct: mapping.construct,
  ...(mapping.facet ? { facet: mapping.facet } : {}),
  direction: mapping.direction,
  respondentType: 'unknown',
  qualityState: 'invalid',
  qualityFlags: ['missing_evidence'],
  provenance: {
    sourceType: 'missing_bundle_evidence',
    sourceResultId: `missing:${mapping.mappingKey}`,
    mappingKey: mapping.mappingKey,
    mappingVersion: mapping.mappingVersion,
  },
})

const validateEvidence = (
  input: BuildMentalHealthBundleAnalysisInput,
): FrozenBundleScaleEvidence[] => {
  const mappingIndex = mappingIndexFor(input.bundle)
  const slotIndex = mappingSlotFor(input.bundle)
  const seen = new Set<string>()
  const normalized: FrozenBundleScaleEvidence[] = []
  for (const evidence of input.scaleResults) {
    const mapping = mappingIndex.get(evidence.mappingKey)
    const slotKey = slotIndex.get(evidence.mappingKey)
    if (!mapping || !slotKey) fail(`Bundle evidence 引用了未知 mapping：${evidence.mappingKey}`)
    const resolvedMapping = mapping as BundleEvidenceMappingDefinition
    if (evidence.slotKey !== slotKey) fail(`Bundle evidence slot 不匹配：${evidence.mappingKey}`)
    if (evidence.mappingVersion !== resolvedMapping.mappingVersion) fail(`Bundle evidence mapping 版本不匹配：${evidence.mappingKey}`)
    if (evidence.scaleCode !== resolvedMapping.scaleCode) fail(`Bundle evidence scale code 不匹配：${evidence.mappingKey}`)
    if (evidence.scoreKey !== resolvedMapping.scoreKey) fail(`Bundle evidence score key 不匹配：${evidence.mappingKey}`)
    if (seen.has(evidence.mappingKey)) fail(`Bundle evidence mapping 重复：${evidence.mappingKey}`)
    seen.add(evidence.mappingKey)
    normalized.push({ ...evidence, qualityState: qualityStateFor(evidence) })
  }
  for (const slot of input.bundle.scaleSlots) {
    for (const mapping of slot.mappings) {
      if (!seen.has(mapping.mappingKey)) normalized.push(placeholderFor(mapping, slot.key, input.profile))
    }
  }
  return normalized
}

const coreRuleFor = (
  rules: BundleCoreRuleDefinition[],
  evidenceByMapping: Map<string, BundleEvidenceFact>,
): BundleCoreRuleDefinition | null => rules.find((rule) => rule.requiredEvidence.every((required) => (
  evidenceByMapping.get(required.mappingKey)?.interpretable === true
  && evidenceByMapping.get(required.mappingKey)?.classification === required.classification
))) ?? null

const safetySignalsFor = (
  mappings: Map<string, BundleEvidenceMappingDefinition>,
  evidence: BundleEvidenceFact[],
) => evidence
  .filter((entry) => entry.role === 'SAFETY')
  .map((entry) => {
    const mapping = mappings.get(entry.mappingKey)
    const active = Boolean(
      entry.scoreStatus !== 'not_calculable'
      && entry.value !== null
      && entry.classification
      && mapping?.safetyTriggerCodes?.includes(entry.classification),
    )
    return {
      evidenceRef: entry.id,
      mappingKey: entry.mappingKey,
      active,
      code: entry.classification,
    }
  })

const feedbackTextFor = (bundle: MentalHealthBundleDefinition, key: string | null, fallback: string): string => {
  if (!key) return fallback
  return bundle.feedbackBlocks.find((block) => block.key === key)?.text ?? fallback
}

const conclusionFor = (outcomeCode: BundleOutcomeCode): string => {
  switch (outcomeCode) {
    case 'LOW_CONCERN': return '本次结果未显示需要进一步关注的明确共同信号。'
    case 'MIXED_RESULTS': return '本次结果包含方向不一致或无法相互印证的信息。'
    case 'CONSISTENT_SIGNAL': return '本次多个预先指定来源在同一主题上呈现一致信号。'
    case 'STRONG_CONVERGENCE': return '本次多个预先指定来源在同一主题上呈现较强一致信号。'
    case 'CONCERN_WITH_LOW_WELLBEING': return '本次结果显示需要关注的主题，同时整体福祉得分偏低。'
    case 'SAFETY_ESCALATED': return '本次结果触发了安全信号，需要按照项目安全流程处理。'
    case 'INSUFFICIENT_QUALITY': return '本次结果的质量或必要信息不足，不能形成可靠的综合判断。'
  }
}

const nextStepsFor = (actionTier: BundleActionTier): string[] => {
  switch (actionTier) {
    case 'SAFETY_ESCALATION': return ['请按项目安全流程进行及时人工复核；本页面不替代危机处置。']
    case 'FOLLOW_UP': return ['建议由合适的专业人员结合情境、时间变化和实际困扰进行进一步了解。']
    case 'DISCUSS': return ['建议结合近期生活情境进行温和、非诊断性的沟通和观察。']
    case 'OBSERVE': return ['可继续关注近期变化，并在需要时寻求支持。']
    case 'NONE': return ['如有持续困扰，可主动寻求可信任的支持。']
  }
}

const findingsFor = (
  rules: Array<{ ruleId: string; ruleVersion: string; mappingKey: string; feedbackBlockKey: string }>,
  role: 'FACET' | 'CONTEXT',
  evidenceByMapping: Map<string, BundleEvidenceFact>,
): BundleFindingFact[] => rules.map((rule) => {
  const evidence = evidenceByMapping.get(rule.mappingKey)
  return {
    ruleId: rule.ruleId,
    ruleVersion: rule.ruleVersion,
    role,
    key: evidence?.facet || evidence?.construct || rule.mappingKey,
    evidenceRefs: evidence ? [evidence.id] : [],
    available: Boolean(evidence?.interpretable),
    feedbackBlockKey: evidence?.interpretable ? rule.feedbackBlockKey : null,
  }
})

const provenanceFor = (input: BuildMentalHealthBundleAnalysisInput) => ({
  analysisEngineKey: MENTAL_HEALTH_ANALYSIS_ENGINE_KEY,
  packageKey: input.packageKey,
  packageVersion: input.packageVersion,
  packageSnapshotVersion: '2',
  analysisProtocolKey: input.bundle.ruleSetKey,
  analysisProtocolVersion: input.bundle.ruleSetVersion,
  analysisProtocolSnapshotVersion: '2',
  profile: input.profile,
  packageReportDefinitionVersion: input.bundle.reportDefinitionVersion,
  domainDefinitionVersion: 'not-applicable',
  evidenceMappingVersion: input.bundle.evidenceMappingVersion || MENTAL_HEALTH_BUNDLE_EVIDENCE_MAPPING_VERSION,
  recommendationRuleVersion: input.bundle.ruleSetVersion,
  analysisVersion: MENTAL_HEALTH_BUNDLE_ANALYSIS_VERSION,
  reportSchemaVersion: MENTAL_HEALTH_BUNDLE_REPORT_SCHEMA_VERSION,
  ...(input.attemptId ? { attemptId: input.attemptId } : {}),
  ...(input.assessmentId ? { assessmentId: input.assessmentId } : {}),
})

const factsEvidenceFor = (
  input: BuildMentalHealthBundleAnalysisInput,
  evidence: FrozenBundleScaleEvidence[],
): BundleEvidenceFact[] => evidence.map((entry) => ({
  ...entry,
  id: `${entry.sourceResultId}:${entry.mappingKey}`,
  interpretable: entry.qualityState === 'interpretable'
    && entry.scoreStatus === 'calculated'
    && entry.value !== null,
  provenance: {
    ...entry.provenance,
    ...provenanceFor(input),
    slotKey: entry.slotKey,
    sourceResultId: entry.sourceResultId,
    sourceType: entry.provenance.sourceType ?? 'scale_assessment',
    scaleId: entry.scaleId,
    scaleCode: entry.scaleCode,
    instrumentVersion: entry.instrumentVersion,
    scoreKey: entry.scoreKey,
    mappingKey: entry.mappingKey,
    mappingVersion: entry.mappingVersion,
  },
}))

const mainConstructFor = (bundle: MentalHealthBundleDefinition): string => bundle.construct

export const buildMentalHealthBundleAnalysis = (
  input: BuildMentalHealthBundleAnalysisInput,
): MentalHealthBundleAnalysisResult => {
  try {
    validateDefinition(input.bundle)
    if (!input.bundle.profiles.includes(input.profile)) fail(`Bundle 不支持 Profile：${input.profile}`)
    if (input.packageKey !== input.bundle.key || input.packageVersion !== input.bundle.version) {
      fail('Bundle package identity 与 definition 不匹配')
    }
    const normalized = validateEvidence(input)
    const evidence = factsEvidenceFor(input, normalized)
    const evidenceByMapping = new Map(evidence.map((entry) => [entry.mappingKey, entry]))
    const mappingIndex = mappingIndexFor(input.bundle)
    const safetySignals = safetySignalsFor(mappingIndex, evidence)
    const activeSafety = safetySignals.some((signal) => signal.active)
    const requiredCoreMappings = uniqueStrings(input.bundle.coreRules.flatMap((rule) => rule.requiredEvidence.map((entry) => entry.mappingKey)))
    const requiredCoreEvidence = requiredCoreMappings
      .map((mappingKey) => evidenceByMapping.get(mappingKey))
      .filter((entry): entry is BundleEvidenceFact => Boolean(entry))
    const primaryAvailable = requiredCoreMappings.every((mappingKey) => coreEvidenceUsable(
      evidenceByMapping.get(mappingKey),
      mappingIndex.get(mappingKey),
    ))
    const primaryClassificationMissing = requiredCoreMappings.some((mappingKey) => {
      const evidence = evidenceByMapping.get(mappingKey)
      const mapping = mappingIndex.get(mappingKey)
      return Boolean(
        evidence?.interpretable
        && (!evidence.classification
          || Boolean(mapping?.classificationCodes && !mapping.classificationCodes.includes(evidence.classification))),
      )
    })
    const primaryQualityInvalid = requiredCoreEvidence.some((entry) => (
      entry.qualityState === 'invalid'
      || entry.scoreStatus === 'not_calculable'
      || entry.value === null
    ))
    const primaryQualityLimited = requiredCoreEvidence.some((entry) => (
      entry.qualityState === 'limited' || entry.scoreStatus === 'limited'
    ))
    const matchedRule = coreRuleFor(input.bundle.coreRules, evidenceByMapping)
    const outcomeCode: BundleOutcomeCode = activeSafety
      ? 'SAFETY_ESCALATED'
      : !primaryAvailable
        ? 'INSUFFICIENT_QUALITY'
        : matchedRule?.outcomeCode ?? 'MIXED_RESULTS'
    const actionTier: BundleActionTier = activeSafety
      ? 'SAFETY_ESCALATION'
      : !primaryAvailable
        ? 'OBSERVE'
        : matchedRule?.actionTier ?? 'DISCUSS'
    const core = {
      ruleId: matchedRule?.ruleId ?? null,
      ruleVersion: matchedRule?.ruleVersion ?? null,
      requiredEvidence: requiredCoreMappings,
      matched: Boolean(matchedRule) && primaryAvailable,
      outcomeCode,
      actionTier,
      feedbackBlockKey: activeSafety ? null : matchedRule?.feedbackBlockKey ?? null,
    }
    const facetFindings = findingsFor(input.bundle.facetRules, 'FACET', evidenceByMapping)
    const contextFindings = findingsFor(input.bundle.contextRules, 'CONTEXT', evidenceByMapping)
    const excludedEvidenceRefs = evidence.filter((entry) => !entry.interpretable).map((entry) => entry.id)
    const warnings = [
      ...(excludedEvidenceRefs.length > 0 ? ['质量不足的 Scale evidence 未进入正常综合结论。'] : []),
      ...(primaryClassificationMissing ? ['必要的 PRIMARY mapping 缺少受控分类，系统按 insufficient quality 处理。'] : []),
      ...(outcomeCode === 'MIXED_RESULTS' ? ['预先指定的分类组合未命中已审核规则，系统按 fail-closed 处理。'] : []),
      ...(activeSafety ? ['安全信号优先于所有普通 Bundle 反馈。'] : []),
    ]
    const qualityState: BundleQualityState = activeSafety
      ? 'interpretable'
      : requiredCoreEvidence.length === 0 || primaryQualityInvalid || primaryClassificationMissing
        ? 'invalid'
        : primaryQualityLimited || requiredCoreEvidence.some((entry) => qualityRank(entry.qualityState) === 1)
            ? 'limited'
            : 'interpretable'
    const provenance = provenanceFor(input)
    const feedbackBlockKeys = uniqueStrings([
      ...(core.feedbackBlockKey ? [core.feedbackBlockKey] : []),
      ...facetFindings.filter((finding) => finding.available && finding.feedbackBlockKey).map((finding) => finding.feedbackBlockKey as string),
      ...contextFindings.filter((finding) => finding.available && finding.feedbackBlockKey).map((finding) => finding.feedbackBlockKey as string),
    ])
    const facts: BundleReportFacts = {
      schemaVersion: MENTAL_HEALTH_BUNDLE_FACTS_SCHEMA_VERSION,
      analysisEngineKey: MENTAL_HEALTH_ANALYSIS_ENGINE_KEY,
      packageKey: input.packageKey,
      packageVersion: input.packageVersion,
      ruleSetKey: input.bundle.ruleSetKey,
      ruleSetVersion: input.bundle.ruleSetVersion,
      reportDefinitionVersion: input.bundle.reportDefinitionVersion,
      evidenceMappingVersion: input.bundle.evidenceMappingVersion || MENTAL_HEALTH_BUNDLE_EVIDENCE_MAPPING_VERSION,
      profile: input.profile,
      quality: {
        state: qualityState,
        primaryAvailable,
        interpretableEvidenceCount: evidence.filter((entry) => entry.interpretable).length,
        excludedEvidenceRefs,
        warnings,
      },
      core,
      outcomeCode,
      actionTier,
      evidence,
      facetFindings,
      contextFindings,
      safetySignals,
      feedbackBlockKeys,
      limitations: [...input.bundle.limitations],
      subject: {
        userId: input.subject?.userId ?? null,
        subjectKey: input.subject?.subjectKey ?? null,
      },
      respondent: {
        userId: input.respondent?.userId ?? null,
        respondentKey: input.respondent?.respondentKey ?? null,
        respondentType: input.respondent?.respondentType ?? input.bundle.respondentType,
      },
      assessmentEpisodeId: input.assessmentEpisodeId ?? null,
      provenance,
    }
    const fallbackFeedback = conclusionFor(outcomeCode)
    const conclusion = activeSafety
      ? fallbackFeedback
      : feedbackTextFor(input.bundle, matchedRule?.feedbackBlockKey ?? null, fallbackFeedback)
    const report = {
      conclusion,
      mainConstruct: mainConstructFor(input.bundle),
      consistency: outcomeCode === 'MIXED_RESULTS' ? 'mixed' : outcomeCode === 'INSUFFICIENT_QUALITY' ? 'not_interpretable' : 'consistent',
      facets: facetFindings.map((finding) => ({
        key: finding.key,
        available: finding.available,
        feedback: finding.available && finding.feedbackBlockKey
          ? feedbackTextFor(input.bundle, finding.feedbackBlockKey, '保留该分面作为描述性信息。')
          : null,
        evidenceRefs: finding.evidenceRefs,
      })),
      context: contextFindings.map((finding) => ({
        key: finding.key,
        available: finding.available,
        feedback: finding.available && finding.feedbackBlockKey
          ? feedbackTextFor(input.bundle, finding.feedbackBlockKey, '保留该背景信息作为解释上下文。')
          : null,
        evidenceRefs: finding.evidenceRefs,
      })),
      nextSteps: nextStepsFor(actionTier),
      limitations: [...input.bundle.limitations],
    }
    return {
      analysisEngineKey: MENTAL_HEALTH_ANALYSIS_ENGINE_KEY,
      packageKey: input.packageKey,
      packageVersion: input.packageVersion,
      analysisProtocolKey: input.bundle.ruleSetKey,
      analysisProtocolVersion: input.bundle.ruleSetVersion,
      profile: input.profile,
      analysisVersion: MENTAL_HEALTH_BUNDLE_ANALYSIS_VERSION,
      reportSchemaVersion: MENTAL_HEALTH_BUNDLE_REPORT_SCHEMA_VERSION,
      qualitySummary: {
        interpretableModules: evidence.filter((entry) => entry.interpretable).length,
        excludedModules: excludedEvidenceRefs,
        warnings,
      },
      outcomeCode,
      actionTier,
      bundleReportFacts: facts,
      report,
      evidence,
      limitations: [...input.bundle.limitations],
      provenance,
    }
  } catch (error) {
    if (error instanceof MentalHealthBundleInputError) throw error
    throw new MentalHealthBundleInputError('Bundle 冻结输入格式无效')
  }
}

export const isMentalHealthBundleAnalysisResult = (
  value: unknown,
): value is MentalHealthBundleAnalysisResult => (
  isRecord(value) && value.analysisEngineKey === MENTAL_HEALTH_ANALYSIS_ENGINE_KEY
)
