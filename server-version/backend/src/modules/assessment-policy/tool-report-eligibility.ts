/**
 * Tool-level participant report eligibility (publish/freeze-time gate).
 *
 * Core product rule:
 * - Whether a participant can receive a report is determined by the tool/scale
 *   itself (whether it has a complete configured report: thresholds + mapped
 *   prose/images/materials, a bound declarative REPORT template, or a configured
 *   native report), NOT by which portal delivers it.
 * - Research / data-collection-only tools without a configured report are
 *   DATA_COLLECTION_ONLY and must NOT disclose reports to participants.
 * - Any portal/publisher may still opt out at publish time to deliver
 *   receipt-only (GENERAL_ONLY / receiptOnly=true) even when a tool is READY.
 */

export type ToolParticipantReportSource =
  | 'DECLARED_REPORT_RELEASE'
  | 'RAW_SCORE_FEEDBACK'
  | 'SCALE_INTERPRETATIONS'
  | 'STANDARD_TRIPLET_REPORT'
  | 'NATIVE_TASK_REPORT'
  | 'NONE'

export interface ToolParticipantReportEligibility {
  eligible: boolean
  mode: 'CONFIGURED_REPORT' | 'DATA_COLLECTION_ONLY'
  source: ToolParticipantReportSource
  reason: string | null
}

const PLACEHOLDER_REPORT_VERSIONS = new Set(['none-v1', 'survey-private-score-v1'])
const PLACEHOLDER_SUMMARIES = new Set([
  '',
  '本版本不配置报告或反馈。',
  '本配置不提供文字报告。',
  '研究探索性得分，不对被试作诊断或常模解释。',
])

const ready = (source: Exclude<ToolParticipantReportSource, 'NONE'>): ToolParticipantReportEligibility => ({
  eligible: true,
  mode: 'CONFIGURED_REPORT',
  source,
  reason: null,
})

const dataCollectionOnly = (reason: string): ToolParticipantReportEligibility => ({
  eligible: false,
  mode: 'DATA_COLLECTION_ONLY',
  source: 'NONE',
  reason,
})

const isRecord = (value: unknown): value is Record<string, unknown> => (
  value !== null && typeof value === 'object' && !Array.isArray(value)
)

const nonEmptyText = (value: unknown): boolean => typeof value === 'string' && value.trim().length > 0

/** True iff at least one score rule defines threshold ranges with non-empty feedback text. */
export function hasConfiguredRawScoreFeedback(rawScoreFeedback: unknown): boolean {
  if (!isRecord(rawScoreFeedback)) return false
  const rules = rawScoreFeedback.rules
  if (!Array.isArray(rules) || rules.length === 0) return false
  return rules.some((rule) => {
    if (!isRecord(rule) || !Array.isArray(rule.ranges) || rule.ranges.length === 0) return false
    return rule.ranges.every((range) => (
      isRecord(range)
      && typeof range.min === 'number' && Number.isFinite(range.min)
      && typeof range.max === 'number' && Number.isFinite(range.max)
      && nonEmptyText(range.text)
    ))
  })
}

/** True iff a ScaleDefinitionV2.report (or ScaleDraft) has real configured report content
 * (threshold-mapped rawScoreFeedback, or non-placeholder bands/guidance/interpretations). */
export function evaluateScaleReportObject(report: unknown): ToolParticipantReportEligibility {
  if (!isRecord(report)) {
    return dataCollectionOnly('量表未配置报告内容（缺少阈值分段、解读文案或报告模板），仅用于数据采集')
  }
  if (hasConfiguredRawScoreFeedback(report.rawScoreFeedback)) {
    return ready('RAW_SCORE_FEEDBACK')
  }
  const reportVersion = typeof report.reportVersion === 'string' ? report.reportVersion.trim() : ''
  if (PLACEHOLDER_REPORT_VERSIONS.has(reportVersion)) {
    return dataCollectionOnly('量表仅含默认占位报告，未配置阈值分段、解读文案或报告模板，仅用于数据采集')
  }
  const interpretations = Array.isArray(report.interpretations) ? report.interpretations : []
  const hasRealInterpretation = interpretations.some((entry) => {
    if (!isRecord(entry)) return false
    const bands = Array.isArray(entry.bands) ? entry.bands : []
    const guidance = Array.isArray(entry.guidance) ? entry.guidance : []
    const summary = typeof entry.summary === 'string' ? entry.summary.trim() : ''
    const hasBands = bands.some((band) => isRecord(band) && nonEmptyText(band.interpretation))
    const hasGuidance = guidance.some((item) => isRecord(item) ? nonEmptyText(item.text) : nonEmptyText(item))
    const hasSubstantiveSummary = summary.length > 0 && !PLACEHOLDER_SUMMARIES.has(summary)
    return hasBands || hasGuidance || hasSubstantiveSummary
  })
  if (hasRealInterpretation) {
    return ready('SCALE_INTERPRETATIONS')
  }
  return dataCollectionOnly('量表未配置阈值分档、解读文案或报告模板，仅用于数据采集')
}

export function hasConfiguredScaleDefinitionReport(definition: unknown): ToolParticipantReportEligibility {
  if (!isRecord(definition)) {
    return dataCollectionOnly('量表定义缺少报告配置，仅用于数据采集')
  }
  // Support both ScaleDefinitionV2 (`definition.report`) and Survey ScaleDraft (`definition.rawScoreFeedback`).
  if (hasConfiguredRawScoreFeedback(definition.rawScoreFeedback)) {
    return ready('RAW_SCORE_FEEDBACK')
  }
  return evaluateScaleReportObject(definition.report)
}

export interface SurveyUnitEligibilityInput {
  kind: 'FORM' | 'SCALE' | 'SJT' | 'COGNITIVE'
  executionProtocol?: string | null
  compiledDefinition?: unknown
  displayDefinition?: unknown
  sourceProvenance?: Record<string, unknown> | null
  contentSelection?: { reportRelease?: { releaseId: string; contentHash: string } | null } | null
  nativeBundleReport?: unknown
  nativeBundleCognitiveReport?: unknown
}

/** Publish/freeze-time report eligibility for a Survey unit.
 * Must be evaluated AFTER governed/triplet/content-selection report bindings attach. */
export function evaluateSurveyUnitReportEligibility(unit: SurveyUnitEligibilityInput): ToolParticipantReportEligibility {
  if (unit.kind === 'FORM') {
    return dataCollectionOnly('普通表单仅用于信息采集，不生成受测者报告')
  }
  if (unit.sourceProvenance?.reportConfigured === false) {
    return dataCollectionOnly('该已定版工具明确不配置报告，仅用于数据采集')
  }
  if (unit.kind === 'COGNITIVE') {
    return ready('NATIVE_TASK_REPORT')
  }
  if (unit.contentSelection?.reportRelease) {
    return ready('DECLARED_REPORT_RELEASE')
  }
  if (unit.kind === 'SJT') {
    if (unit.executionProtocol === 'SITUATIONAL_NATIVE_V1') {
      return ready('NATIVE_TASK_REPORT')
    }
    return dataCollectionOnly('该情境测验未配置完整报告模板或原生报告，仅用于数据采集')
  }
  // SCALE:
  if (unit.nativeBundleReport || unit.sourceProvenance?.reportConfigured === true) {
    return ready('STANDARD_TRIPLET_REPORT')
  }
  const scaleEligibility = hasConfiguredScaleDefinitionReport(unit.compiledDefinition)
  if (scaleEligibility.eligible) return scaleEligibility
  return hasConfiguredScaleDefinitionReport(unit.displayDefinition)
}

export interface EducationLeafEligibilityInput {
  kind: 'SCALE' | 'FORM' | 'COGNITIVE' | 'SJT'
  sourceProvider?: string | null
  standardReportConfigured?: boolean | null
  reportObject?: unknown
}

/** Publish/freeze-time report eligibility for an Education (School / Teacher) composition block. */
export function evaluateEducationLeafReportEligibility(leaf: EducationLeafEligibilityInput): ToolParticipantReportEligibility {
  if (leaf.kind === 'FORM') {
    return dataCollectionOnly('普通表单仅用于信息采集，不生成受测者报告')
  }
  if (leaf.kind === 'COGNITIVE' || leaf.kind === 'SJT') {
    return ready('NATIVE_TASK_REPORT')
  }
  if (leaf.sourceProvider === 'STANDARD_SCALE') {
    return leaf.standardReportConfigured === false
      ? dataCollectionOnly('该标准量表组合未配置报告（REPORT=none），仅用于数据采集')
      : ready('STANDARD_TRIPLET_REPORT')
  }
  return evaluateScaleReportObject(leaf.reportObject)
}

export interface TrainingItemEligibilityInput {
  id: string
  type: string
  label?: string | null
  standardCombinationSource?: unknown
  scale?: {
    name?: string | null
    instrumentClass?: string | null
    definition?: unknown
  } | null
}

export interface TrainingBoundUnitHint {
  itemId: string
  report?: { releaseId: string; contentHash: string } | null
  source?: { standardCombination?: unknown } | null
}

/** Publish-time report eligibility for a Training questionnaire item. */
export function evaluateTrainingItemReportEligibility(
  item: TrainingItemEligibilityInput,
  boundUnit?: TrainingBoundUnitHint | null,
): ToolParticipantReportEligibility {
  if (item.type === 'FORM') {
    return dataCollectionOnly('普通表单仅用于信息采集，不生成受测者报告')
  }
  if (item.type === 'COGNITIVE' || item.type === 'SITUATIONAL') {
    return ready('NATIVE_TASK_REPORT')
  }
  if (item.type !== 'SCALE') {
    return dataCollectionOnly('未知工具类型，仅用于数据采集')
  }
  if (boundUnit?.report) {
    return ready('DECLARED_REPORT_RELEASE')
  }
  // Standard combination scales carry their approved REPORT axis in boundUnit.report
  // (or in standardCombinationSource.reference.reportConfigured / parts).
  if (item.standardCombinationSource != null || boundUnit?.source?.standardCombination != null) {
    if (boundUnit) {
      // Bound unit exists (during/after snapshot prep) without report -> REPORT=none!
      return dataCollectionOnly('该标准量表组合未配置报告（REPORT=none），仅用于数据采集')
    }
    const sourceObj = isRecord(item.standardCombinationSource) ? item.standardCombinationSource : null
    const refObj = sourceObj && isRecord(sourceObj.reference) ? sourceObj.reference : null
    if (refObj && refObj.reportConfigured === false) {
      return dataCollectionOnly('该标准量表组合未配置报告（REPORT=none），仅用于数据采集')
    }
    if (refObj && refObj.reportConfigured === true) {
      return ready('STANDARD_TRIPLET_REPORT')
    }
  }
  return hasConfiguredScaleDefinitionReport(item.scale?.definition)
}

export interface CollectionReportEligibilitySummary {
  hasEligibleUnits: boolean
  eligibleCount: number
  dataCollectionOnlyCount: number
  units: Array<{
    id: string
    title: string
    kind: string
    eligibility: ToolParticipantReportEligibility
  }>
}

export function summarizeCollectionReportEligibility(
  units: Array<{ id: string; title: string; kind: string; eligibility: ToolParticipantReportEligibility }>,
): CollectionReportEligibilitySummary {
  const eligibleCount = units.filter((u) => u.eligibility.eligible).length
  return {
    hasEligibleUnits: eligibleCount > 0,
    eligibleCount,
    dataCollectionOnlyCount: units.length - eligibleCount,
    units,
  }
}
