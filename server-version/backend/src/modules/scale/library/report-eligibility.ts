/**
 * Pilot Report / Claim Eligibility（SL2-C4）。
 *
 * 核心裁定（§15/§16/§17）：PILOT 也必须具备完整可用报告；报告等级
 * L1 SCORE_ONLY / L2 DESCRIPTIVE / L3 REFERENCED_INTERPRETIVE 与
 * scientificMaturity（PILOT / RESEARCH_GRADE）**不得一一绑定**——
 * 六种 maturity × level 组合都允许，取决于 instrument 实际拥有的
 * 合法、适用的解释依据。
 *
 * L3 必须绑定真实 versioned Reference（§18）；local_pilot / literature_beta
 * 级 reference 支持的 L3 必须使用 pilot 措辞，禁止 reference claim inflation
 * （§19：不得宣称全国常模 / 正式常模 / 标准化全国排名）。
 *
 * 本模块是纯 evaluator / read model：不进 runtime，不改报告渲染行为。
 */
import type { ScaleDefinitionV2 } from '../scale-definition'
import type { AssessmentReferenceSetDefinition } from '../../assessment-reference/reference'
import type { ScaleReferenceApplicabilityRecord, RespondentType } from './catalog-manifest'

export type ReportLevel = 'L1_SCORE_ONLY' | 'L2_DESCRIPTIVE' | 'L3_REFERENCED_INTERPRETIVE'

export const REPORT_LEVELS: readonly ReportLevel[] = ['L1_SCORE_ONLY', 'L2_DESCRIPTIVE', 'L3_REFERENCED_INTERPRETIVE']

/** local_pilot / literature_beta 级 reference 只支持试行措辞（§19）。 */
export const PILOT_LEVEL_EVIDENCE = new Set(['local_pilot', 'literature_beta'])

export const PILOT_REQUIRED_WORDING = '相对于当前本地试行参考样本……'
export const PILOT_FORBIDDEN_CLAIMS = ['全国常模', '中国学生正式常模', '标准化全国排名'] as const

export interface ReportLevelEligibility {
  level: ReportLevel
  eligible: boolean
  reasons: string[]
}

export interface ReportEligibilityInput {
  definition: ScaleDefinitionV2
  references: AssessmentReferenceSetDefinition[]
  instrumentKey: string
  instrumentVersion: string
  scoringVersion: string
  /** catalog referenceApplicability 与部署上下文冲突时在治理层拦截 L3（§31 Case C）。 */
  deployment?: { territory?: string; respondent?: RespondentType; locale?: string }
  catalogReferenceApplicability?: ScaleReferenceApplicabilityRecord[]
}

export interface ReportEligibilityDecision {
  levels: Record<ReportLevel, ReportLevelEligibility>
  maxEligibleLevel: ReportLevel | null
  pilotWordingRequired: boolean
  requiredReferenceWording: string[]
  forbiddenClaims: readonly string[]
}

const eligibility = (level: ReportLevel, eligible: boolean, reasons: string[]): ReportLevelEligibility => ({
  level,
  eligible,
  reasons,
})

const referenceConflictWithDeployment = (
  selection: { referenceVersion: string; referenceKind: string },
  input: ReportEligibilityInput,
): string | null => {
  const { deployment, catalogReferenceApplicability } = input
  if (!deployment || !catalogReferenceApplicability) return null
  const records = catalogReferenceApplicability.filter((record) => (
    record.referenceVersion === selection.referenceVersion && record.referenceKind === selection.referenceKind
  ))
  if (records.length === 0) return null
  // 同一 selection 可有多条 applicability（不同 territory/respondent/locale）：
  // 存在任意一条匹配部署上下文即不冲突；全部不匹配才阻断。
  const hasMatch = records.some((record) => (
    (!deployment.territory || record.territory === deployment.territory)
    && (!deployment.respondent || record.respondent === deployment.respondent)
    && (!deployment.locale || record.locale === deployment.locale)
  ))
  if (hasMatch) return null
  const declared = records.map((record) => `${record.territory}/${record.respondent}`).join(', ')
  return `reference ${selection.referenceVersion} 的 applicability（${declared}）无一匹配部署上下文（territory=${deployment.territory ?? 'any'}, respondent=${deployment.respondent ?? 'any'}, locale=${deployment.locale ?? 'any'}）`
}

export const evaluateReportEligibility = (input: ReportEligibilityInput): ReportEligibilityDecision => {
  const scoreKeys = new Set(input.definition.scoring.scores.map((score) => score.key))

  const l1 = eligibility(
    'L1_SCORE_ONLY',
    scoreKeys.size > 0,
    scoreKeys.size > 0 ? [] : ['definition 没有任何 score'],
  )

  const hasDescriptiveLayer = input.definition.report.interpretations.length > 0
    && input.definition.report.disclaimer.trim().length > 0
  const l2 = eligibility(
    'L2_DESCRIPTIVE',
    l1.eligible && hasDescriptiveLayer,
    l1.eligible
      ? (hasDescriptiveLayer ? [] : ['report 缺少解释或免责声明，descriptive 报告不成立'])
      : ['L1 不成立'],
  )

  const l3Reasons: string[] = []
  let pilotWordingRequired = false
  if (input.definition.referencePolicy.type !== 'declared') {
    l3Reasons.push('definition.referencePolicy 未声明任何 reference（L3 需要真实 versioned reference）')
  } else if (input.definition.referencePolicy.selections.length === 0) {
    l3Reasons.push('referencePolicy=declared 但没有任何 selection')
  } else {
    for (const selection of input.definition.referencePolicy.selections) {
      const set = input.references.find((candidate) => (
        candidate.instrumentType === 'scale'
        && candidate.instrumentKey === input.instrumentKey
        && candidate.referenceVersion === selection.referenceVersion
      ))
      if (!set) {
        l3Reasons.push(`reference set 不存在：${selection.referenceVersion}`)
        continue
      }
      if (set.status !== 'ACTIVE') {
        l3Reasons.push(`reference set ${selection.referenceVersion} 状态为 ${set.status}，非 ACTIVE 不得用于 L3`)
        continue
      }
      const entry = set.entries.find((candidate) => (
        candidate.scoreKey === selection.scoreKey && candidate.referenceKind === selection.referenceKind
      ))
      if (!entry) {
        l3Reasons.push(`reference ${selection.referenceVersion} 缺少 scoreKey=${selection.scoreKey}/referenceKind=${selection.referenceKind} 的 entry`)
        continue
      }
      if (entry.instrumentVersion !== input.instrumentVersion) {
        l3Reasons.push(`reference entry instrumentVersion=${entry.instrumentVersion} 与 package ${input.instrumentVersion} 不一致`)
        continue
      }
      if (entry.scoringVersion !== input.scoringVersion) {
        l3Reasons.push(`reference entry scoringVersion=${entry.scoringVersion} 与 definition ${input.scoringVersion} 不一致`)
        continue
      }
      const conflict = referenceConflictWithDeployment(selection, input)
      if (conflict) {
        l3Reasons.push(conflict)
        continue
      }
      if (PILOT_LEVEL_EVIDENCE.has(entry.evidenceLevel)) {
        pilotWordingRequired = true
      }
    }
  }
  const l3 = eligibility('L3_REFERENCED_INTERPRETIVE', l3Reasons.length === 0, l3Reasons)

  const levels = { L1_SCORE_ONLY: l1, L2_DESCRIPTIVE: l2, L3_REFERENCED_INTERPRETIVE: l3 } as Record<ReportLevel, ReportLevelEligibility>
  const maxEligibleLevel = [...REPORT_LEVELS].reverse().find((level) => levels[level].eligible) ?? null

  return {
    levels,
    maxEligibleLevel,
    pilotWordingRequired,
    requiredReferenceWording: pilotWordingRequired ? [PILOT_REQUIRED_WORDING] : [],
    forbiddenClaims: PILOT_FORBIDDEN_CLAIMS,
  }
}
