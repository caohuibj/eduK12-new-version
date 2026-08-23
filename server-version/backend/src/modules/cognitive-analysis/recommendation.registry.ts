import type { RecommendationRuleDefinition } from './cognitive-analysis.types'

export const COGNITIVE_RECOMMENDATION_RULE_VERSION = '1.0.0'

// PR10 才加入正式规则。先冻结有类型的不可变契约，避免 PR6/PR8 临时生成建议文案。
const RULES: RecommendationRuleDefinition[] = []

export const listRecommendationRuleDefinitions = (): RecommendationRuleDefinition[] => [...RULES]

