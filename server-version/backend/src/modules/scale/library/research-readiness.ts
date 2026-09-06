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
}

export interface ResearchGradeReadinessDecision {
  status: ResearchReadinessStatus
  strengths: string[]
  gaps: string[]
  evidenceRefs: string[]
}

const isSatisfied = (rating: ScaleEvidenceRecord['rating']): boolean => (
  rating === 'SUFFICIENT' || rating === 'MIXED'
)

/** 按 SUFFICIENT > MIXED > 其余评级取最优记录；INSUFFICIENT/UNKNOWN 也要返回，供 gap 消息引用评级。 */
const bestEvidenceFor = (evidence: ScaleEvidenceRecord[], evidenceType: EvidenceType): ScaleEvidenceRecord | undefined => {
  const records = evidence.filter((record) => record.evidenceType === evidenceType)
  return records.find((record) => record.rating === 'SUFFICIENT')
    ?? records.find((record) => record.rating === 'MIXED')
    ?? records[0]
}

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

  const uniqueUses = [...new Set(input.intendedUses)]
  for (const use of uniqueUses) {
    const relevance = RELEVANCE_BY_INTENDED_USE[use]
    for (const evidenceType of relevance.required) {
      requiredTotal += 1
      const record = bestEvidenceFor(input.evidence, evidenceType)
      if (record && isSatisfied(record.rating)) {
        requiredSatisfied += 1
        evidenceRefs.add(record.evidenceId)
        strengths.push(`[${use}] ${evidenceType}：${record.rating}（${record.citation}）`)
      } else if (record) {
        gaps.push(`[${use}] required ${evidenceType}：现有证据评级 ${record.rating}，不足以支持 research grade`)
      } else {
        gaps.push(`[${use}] required ${evidenceType}：缺少证据`)
      }
    }
    for (const evidenceType of relevance.optional) {
      const record = bestEvidenceFor(input.evidence, evidenceType)
      if (record && isSatisfied(record.rating)) {
        evidenceRefs.add(record.evidenceId)
        strengths.push(`[${use}] ${evidenceType}：${record.rating}（${record.citation}）`)
      }
      // optional 缺失 = NOT_APPLICABLE for this claim，不产生 gap（§23）
    }
  }

  const status: ResearchReadinessStatus = requiredSatisfied === requiredTotal
    ? 'READY'
    : requiredSatisfied > 0 ? 'PARTIAL' : 'NOT_ESTABLISHED'

  return { status, strengths, gaps, evidenceRefs: [...evidenceRefs] }
}
