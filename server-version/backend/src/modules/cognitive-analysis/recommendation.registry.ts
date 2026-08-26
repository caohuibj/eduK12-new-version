import type {
  CognitiveDomainResult,
  RecommendationAudience,
  RecommendationRuleContext,
  RecommendationRuleDefinition,
  RecommendationResult,
} from './cognitive-analysis.types'

export const COGNITIVE_RECOMMENDATION_RULE_VERSION = '1.1.0'
export const LEGACY_COGNITIVE_RECOMMENDATION_RULE_VERSION = '1.0.0'

const CURRENT_RULE_VERSION = COGNITIVE_RECOMMENDATION_RULE_VERSION

type DomainPredicate = (domain: CognitiveDomainResult, context: RecommendationRuleContext) => boolean

const domainEvidenceRefs = (domain: CognitiveDomainResult): string[] =>
  domain.evidence.map((item) => item.id)

const textForDomains = (
  predicate: DomainPredicate,
  texts: {
    participant: (domain: CognitiveDomainResult) => string
    teacher: (domain: CognitiveDomainResult) => string
    researcher: (domain: CognitiveDomainResult) => string
  },
): Record<RecommendationAudience, (context: RecommendationRuleContext) => string> => ({
  participant: (context) => context.cognitiveDomains.filter((domain) => predicate(domain, context)).map(texts.participant).join('；'),
  teacher: (context) => context.cognitiveDomains.filter((domain) => predicate(domain, context)).map(texts.teacher).join('；'),
  researcher: (context) => context.cognitiveDomains.filter((domain) => predicate(domain, context)).map(texts.researcher).join('；'),
})

const insufficientQuality: DomainPredicate = (domain) => domain.status === 'insufficient_quality'
const mixedOrDivergent: DomainPredicate = (domain) =>
  domain.status === 'interpretable' && (domain.consistency === 'mixed' || domain.consistency === 'divergent')
const hasDivergentFinding = (context: RecommendationRuleContext): boolean =>
  context.crossSourceFindings.some((finding) => finding.type === 'divergence')
const clearDifficulty: DomainPredicate = (domain, context) =>
  domain.status === 'interpretable'
  && domain.consistency !== 'divergent'
  // An unknown self-report direction does not erase an explicit behavioral
  // difficulty direction. Suppress only when the same domain has an opposing
  // strength direction or an explicit cross-source divergence.
  && !domain.evidence.some((item) => item.interpretable && item.value !== null && item.directionClass === 'more_strength')
  && !context.crossSourceFindings.some((finding) => finding.construct === domain.domain && finding.type === 'divergence')
  && domain.watchItems.length > 0

const mixedOrDivergentDomains = (context: RecommendationRuleContext): CognitiveDomainResult[] =>
  context.cognitiveDomains.filter((domain) => mixedOrDivergent(domain, context))

const contextDifferenceText = (
  context: RecommendationRuleContext,
  audience: 'teacher' | 'researcher',
): string => {
  const domains = mixedOrDivergentDomains(context)
  const domainTexts = domains.map((domain) => audience === 'teacher'
    ? `「${domain.label}」的不同来源表现存在情境差异，建议分别结合任务要求阅读；不判断任一来源错误。`
    : `「${domain.label}」的不同来源表现存在情境差异；该提示不判断任一来源错误，也不作诊断或因果推断。`)
  // Keep a standalone finding useful for future protocols, but do not append
  // a near-duplicate generic sentence when a domain sentence already exists.
  const standaloneFinding = hasDivergentFinding(context) && domains.length === 0
    ? audience === 'teacher'
      ? '不同来源表现存在情境差异，建议分别结合任务要求阅读；不判断任一来源错误。'
      : '不同来源表现存在情境差异；该提示不判断任一来源错误，也不作诊断或因果推断。'
    : null
  return [...new Set([...domainTexts, ...(standaloneFinding ? [standaloneFinding] : [])])].join('；')
}

const RULES: RecommendationRuleDefinition[] = [
  {
    id: 'insufficient_quality_follow_up',
    version: CURRENT_RULE_VERSION,
    construct: 'domain',
    audiences: ['participant', 'teacher', 'researcher'],
    priority: 'follow_up',
    domainMatches: insufficientQuality,
    matches: (context) => context.cognitiveDomains.some((domain) => insufficientQuality(domain, context)),
    evidenceRefs: (context) => context.cognitiveDomains.filter((domain) => insufficientQuality(domain, context)).flatMap(domainEvidenceRefs),
    textByAudience: textForDomains(insufficientQuality, {
      participant: (domain) => `「${domain.label}」当前数据质量不足，后续可结合一次完整且质量充分的结果继续观察。`,
      teacher: (domain) => `「${domain.label}」当前数据质量不足，后续可在完成且质量充分时继续进行非评判性观察。`,
      researcher: (domain) => `「${domain.label}」当前数据质量不足；该跟进提示仅用于描述性数据质量管理，不代表诊断或因果结论。`,
    }),
  },
  {
    id: 'paired_source_description_info',
    version: CURRENT_RULE_VERSION,
    construct: 'cross_source',
    audiences: ['participant', 'teacher', 'researcher'],
    priority: 'info',
    matches: (context) => context.crossSourceFindings.some((finding) => finding.type === 'paired_description'),
    evidenceRefs: (context) => context.crossSourceFindings
      .filter((finding) => finding.type === 'paired_description')
      .flatMap((finding) => finding.evidenceRefs),
    textByAudience: {
      participant: () => '本次结果同时保留了不同来源的描述，建议分别结合各自任务情境阅读。',
      teacher: () => '本次结果同时保留了不同来源的描述，建议分别结合各自任务情境阅读，不作来源间高低判断。',
      researcher: () => '本次结果同时保留了不同来源的描述；该信息提示不作来源间高低、诊断或因果判断。',
    },
  },
  {
    id: 'clear_difficulty_watch',
    version: CURRENT_RULE_VERSION,
    construct: 'domain',
    audiences: ['participant', 'teacher', 'researcher'],
    priority: 'watch',
    domainMatches: clearDifficulty,
    matches: (context) => context.cognitiveDomains.some((domain) => clearDifficulty(domain, context)),
    evidenceRefs: (context) => context.cognitiveDomains.filter((domain) => clearDifficulty(domain, context)).flatMap(domainEvidenceRefs),
    textByAudience: textForDomains(clearDifficulty, {
      participant: (domain) => `「${domain.label}」出现明确的困难方向证据，可将其作为后续自我观察线索。`,
      teacher: (domain) => `「${domain.label}」出现明确的困难方向证据，建议结合具体任务情境进行非评判性观察。`,
      researcher: (domain) => `「${domain.label}」保留明确的困难方向证据；该观察提示仅作描述性使用，不代表诊断或因果判断。`,
    }),
  },
  {
    id: 'mixed_or_divergent_context',
    version: CURRENT_RULE_VERSION,
    construct: 'cross_source',
    audiences: ['teacher', 'researcher'],
    priority: 'watch',
    matches: (context) => mixedOrDivergentDomains(context).length > 0 || hasDivergentFinding(context),
    evidenceRefs: (context) => [
      ...mixedOrDivergentDomains(context).flatMap(domainEvidenceRefs),
      ...context.crossSourceFindings
        .filter((finding) => finding.type === 'divergence')
        .flatMap((finding) => finding.evidenceRefs),
    ],
    textByAudience: {
      participant: () => '',
      teacher: (context) => contextDifferenceText(context, 'teacher'),
      researcher: (context) => contextDifferenceText(context, 'researcher'),
    },
  },
  {
    id: 'cross_source_source_gap',
    version: CURRENT_RULE_VERSION,
    construct: 'cross_source',
    audiences: ['teacher', 'researcher'],
    priority: 'follow_up',
    matches: (context) => context.crossSourceFindings.some((finding) =>
      finding.type === 'single_source' || finding.type === 'insufficient_quality'),
    evidenceRefs: (context) => context.crossSourceFindings
      .filter((finding) => finding.type === 'single_source' || finding.type === 'insufficient_quality')
      .flatMap((finding) => finding.evidenceRefs),
    textByAudience: {
      participant: () => '',
      teacher: (context) => {
        const finding = context.crossSourceFindings.find((item) => item.type === 'single_source' || item.type === 'insufficient_quality')
        return finding?.type === 'single_source'
          ? '当前跨来源比较仅有一个可解释来源，建议将结果作为单来源描述阅读。'
          : '当前跨来源比较的数据质量不足，暂不进行来源间解释。'
      },
      researcher: (context) => {
        const finding = context.crossSourceFindings.find((item) => item.type === 'single_source' || item.type === 'insufficient_quality')
        return finding?.type === 'single_source'
          ? '当前跨来源比较仅保留一个可解释来源；该提示用于标记来源不足，不代表任一来源错误。'
          : '当前跨来源比较的数据质量不足；该提示用于标记来源不足，不作诊断或因果推断。'
      },
    },
  },
]

const audienceOrder: RecommendationAudience[] = ['participant', 'teacher', 'researcher']

export const buildRecommendations = (
  context: RecommendationRuleContext,
  ruleVersion = COGNITIVE_RECOMMENDATION_RULE_VERSION,
): RecommendationResult[] => {
  if (ruleVersion !== COGNITIVE_RECOMMENDATION_RULE_VERSION) return []
  const recommendations: RecommendationResult[] = []
  for (const rule of RULES) {
    if (rule.version !== ruleVersion || !rule.matches(context)) continue
    const scopes = rule.domainMatches
      ? context.cognitiveDomains
        .filter((domain) => rule.domainMatches?.(domain, context))
        .map((domain) => ({ ...context, cognitiveDomains: [domain] }))
      : [context]
    for (const scopedContext of scopes) {
      const evidenceRefs = [...new Set(rule.evidenceRefs(scopedContext))]
      for (const audience of audienceOrder) {
        if (!rule.audiences.includes(audience)) continue
        const text = rule.textByAudience[audience](scopedContext)
        if (!text) continue
        recommendations.push({
          ruleId: rule.id,
          ruleVersion: rule.version,
          audience,
          construct: rule.construct,
          priority: rule.priority,
          evidenceRefs,
          text,
        })
      }
    }
  }
  return recommendations
}

export const listRecommendationRuleDefinitions = (): RecommendationRuleDefinition[] => RULES.map((rule) => ({
  ...rule,
  audiences: [...rule.audiences],
  textByAudience: { ...rule.textByAudience },
}))
