/**
 * Research-grade Readiness Review（SL2-C5）。
 *
 * ADMIN / EXPERT ONLY 的纯 read model，且 **NON-BLOCKING FOR PILOT PUBLICATION**：
 * 只回答「若要把某 instrument 升级为 RESEARCH_GRADE，按其声明的 intended use，
 * 证据是否足够」，输出 status / strengths / gaps / evidenceRefs。
 *
 * RESEARCH_GRADE 不是固定万能 checklist（§23）：证据相关性由声明的目标用途决定。
 * 未进入 required 集合的证据维度按 NOT_APPLICABLE 处理——例如一次性教育描述用途
 * 不应被强制要求 responsiveness / 进展监测证据。
 *
 * 不建立 research workflow engine / approval service / 自动晋升；本模块永不进入
 * submit 路径，也永不影响 publishable（那是 pilot-publication-policy 的职责）。
 */
import type { IntendedUse, ScaleEvidenceRecord } from './catalog-manifest'

export type ResearchReadinessStatus = 'READY' | 'PARTIAL' | 'NOT_ESTABLISHED'

type EvidenceType = ScaleEvidenceRecord['evidenceType']

/** 每个目标用途在 research grade 下的 required / optional 证据维度（§23）。 */
const RELEVANCE_BY_INTENDED_USE: Record<IntendedUse, { required: EvidenceType[]; optional: EvidenceType[] }> = {
  RESEARCH: {
    required: ['STRUCTURAL_VALIDITY', 'INTERNAL_CONSISTENCY'],
    optional: ['CONTENT_VALIDITY', 'CONVERGENT_DISCRIMINANT', 'CROSS_CULTURAL_VALIDITY'],
  },
  INDIVIDUAL_REFLECTION: {
    required: ['CONTENT_VALIDITY', 'INTERNAL_CONSISTENCY'],
    optional: [],
  },
  PROGRESS_MONITORING: {
    required: ['RESPONSIVENESS', 'TEST_RETEST'],
    optional: ['MEASUREMENT_INVARIANCE'],
  },
  PROGRAM_EVALUATION: {
    required: ['STRUCTURAL_VALIDITY', 'INTERNAL_CONSISTENCY', 'MEASUREMENT_INVARIANCE'],
    optional: ['RESPONSIVENESS'],
  },
  SCREENING: {
    required: ['STRUCTURAL_VALIDITY', 'INTERNAL_CONSISTENCY', 'CRITERION'],
    optional: ['TEST_RETEST'],
  },
}

export interface ResearchGradeReadinessInput {
  /** 想要在 research grade 下支持的用途；只有这些用途的证据要求参与评估。 */
  intendedUses: IntendedUse[]
  evidence: ScaleEvidenceRecord[]
  /**
   * 当前评估部署上下文。Applicability 只使用 manifest 已结构化的 locale /
   * territory；population / ageRange 是 opaque catalog text，本模块不解析它们。
   */
  deployment: {
    locale: string
    territory: string
  }
}

export interface ResearchGradeReadinessDecision {
  status: ResearchReadinessStatus
  strengths: string[]
  gaps: string[]
  evidenceRefs: string[]
}

/** 只有明确 SUFFICIENT 才能满足 research-grade required evidence。 */
const isSatisfied = (rating: ScaleEvidenceRecord['rating']): boolean => rating === 'SUFFICIENT'

/** 显式评级优先级：SUFFICIENT > MIXED > INSUFFICIENT > UNKNOWN，保证取证结果与输入顺序无关。 */
const RATING_PREFERENCE: Record<ScaleEvidenceRecord['rating'], number> = {
  SUFFICIENT: 0,
  MIXED: 1,
  INSUFFICIENT: 2,
  UNKNOWN: 3,
}

/**
 * 取该证据类型下评级最优的一条适用记录；INSUFFICIENT/UNKNOWN 也要返回，
 * 供 gap 消息引用评级。只使用结构化 locale / territory，不对自由文本 population
 * 做解析或推断，避免在 readiness evaluator 中隐式建立 Population Engine。
 */
const bestEvidenceFor = (
  evidence: ScaleEvidenceRecord[],
  evidenceType: EvidenceType,
  deployment: ResearchGradeReadinessInput['deployment'],
): ScaleEvidenceRecord | undefined => {
  const records = evidence.filter((record) => record.evidenceType === evidenceType)
    .filter((record) => record.locale === deployment.locale && record.territory === deployment.territory)
  return [...records].sort((left, right) => RATING_PREFERENCE[left.rating] - RATING_PREFERENCE[right.rating])[0]
}

const mixedEvidenceFor = (
  evidence: ScaleEvidenceRecord[],
  evidenceType: EvidenceType,
  deployment: ResearchGradeReadinessInput['deployment'],
): ScaleEvidenceRecord[] => evidence.filter((record) => (
  record.evidenceType === evidenceType
  && record.locale === deployment.locale
  && record.territory === deployment.territory
  && record.rating === 'MIXED'
))

export const evaluateResearchGradeReadiness = (input: ResearchGradeReadinessInput): ResearchGradeReadinessDecision => {
  if (input.intendedUses.length === 0) {
    return {
      status: 'NOT_ESTABLISHED',
      strengths: [],
      gaps: ['未声明任何目标 intended use：无法确定哪些证据维度相关'],
      evidenceRefs: [],
    }
  }

  const strengths: string[] = []
  const gaps: string[] = []
  const evidenceRefs = new Set<string>()
  let requiredTotal = 0
  let requiredSatisfied = 0
  let hasMixedEvidence = false

  const uniqueUses = [...new Set(input.intendedUses)]
  for (const use of uniqueUses) {
    const relevance = RELEVANCE_BY_INTENDED_USE[use]
    for (const evidenceType of relevance.required) {
      requiredTotal += 1
      const record = bestEvidenceFor(input.evidence, evidenceType, input.deployment)
      const mixedRecords = mixedEvidenceFor(input.evidence, evidenceType, input.deployment)
      mixedRecords.forEach((mixedRecord) => evidenceRefs.add(mixedRecord.evidenceId))
      if (mixedRecords.length > 0) hasMixedEvidence = true
      if (record && isSatisfied(record.rating)) {
        requiredSatisfied += 1
        evidenceRefs.add(record.evidenceId)
        strengths.push(`[${use}] ${evidenceType}：${record.rating}（${record.citation}）`)
        if (mixedRecords.length > 0) {
          gaps.push(`[${use}] required ${evidenceType}：存在 MIXED 证据，作为 caveat；仅 SUFFICIENT 才能满足 required evidence`)
        }
      } else if (record) {
        gaps.push(`[${use}] required ${evidenceType}：现有证据评级 ${record.rating}，作为 caveat/gap，不足以支持 research grade`)
      } else {
        gaps.push(`[${use}] required ${evidenceType}：缺少适用于 locale=${input.deployment.locale}, territory=${input.deployment.territory} 的证据`)
      }
    }
    for (const evidenceType of relevance.optional) {
      const record = bestEvidenceFor(input.evidence, evidenceType, input.deployment)
      const mixedRecords = mixedEvidenceFor(input.evidence, evidenceType, input.deployment)
      mixedRecords.forEach((mixedRecord) => evidenceRefs.add(mixedRecord.evidenceId))
      if (mixedRecords.length > 0) {
        hasMixedEvidence = true
        gaps.push(`[${use}] optional ${evidenceType}：存在 MIXED 证据，作为 caveat；不将其视为确定性支持`)
      }
      if (record && isSatisfied(record.rating)) {
        evidenceRefs.add(record.evidenceId)
        strengths.push(`[${use}] ${evidenceType}：${record.rating}（${record.citation}）`)
      }
      // optional 缺失 = NOT_APPLICABLE for this claim，不产生 gap（§23）
    }
  }

  const status: ResearchReadinessStatus = requiredSatisfied === requiredTotal && !hasMixedEvidence
    ? 'READY'
    : requiredSatisfied > 0 || hasMixedEvidence ? 'PARTIAL' : 'NOT_ESTABLISHED'

  return { status, strengths, gaps, evidenceRefs: [...evidenceRefs] }
}
