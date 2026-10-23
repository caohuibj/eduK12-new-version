import type {AssessmentMaterial,PublicMaterial} from '../assessment-media/material'
import type { AssessmentImagePresentationItem } from '../assessment-media/types'

export type RawScoreFeedbackImage = AssessmentImagePresentationItem & { order: number }
export type RawScoreFeedbackContent = { text: string; materials?:AssessmentMaterial[]; images?: RawScoreFeedbackImage[] }
export type MatchedRawScoreFeedback = Omit<RawScoreFeedbackContent,'materials'> & { materials?:PublicMaterial[];scoreKey: string; rangeKey: string | null }
export type RawScoreFeedbackRange = RawScoreFeedbackContent & { key: string; min: number; max: number; includeMax: boolean }
export type RawScoreFeedbackRule = { scoreKey: string; ranges: RawScoreFeedbackRange[]; fallback?: RawScoreFeedbackContent }
export type RawScoreFeedback = { schemaVersion: 1; rules: RawScoreFeedbackRule[] }

/** Authoring hints only. The server validates and selects authoritative feedback. */
export function validateRawScoreFeedback(config: RawScoreFeedback | undefined, scoreKeys: readonly string[]): string[] {
  const issues: string[] = []
  const scores = new Set<string>()
  for (const rule of config?.rules ?? []) {
    if (!scoreKeys.includes(rule.scoreKey)) issues.push('反馈引用了不存在的计分指标')
    if (scores.has(rule.scoreKey)) issues.push('每个指标只能有一组原始分反馈')
    scores.add(rule.scoreKey)
    if (!rule.ranges.length) issues.push('请至少添加一个反馈区间')
    const keys = new Set<string>()
    rule.ranges.forEach((range, index) => {
      if (!range.key || keys.has(range.key)) issues.push('区间标识不能为空或重复')
      keys.add(range.key)
      if (!Number.isFinite(range.min) || !Number.isFinite(range.max) || range.min >= range.max) issues.push('区间下限必须小于上限，且必须是有限数字')
      if (!range.text.trim()) issues.push('请填写区间反馈文字')
      if (range.includeMax && index !== rule.ranges.length - 1) issues.push('只有最后区间可以包含上限')
      const previous = rule.ranges[index - 1]
      if (previous && range.min < previous.max) issues.push('区间须按分数排序且不能重叠')
      if (previous && range.min > previous.max && !rule.fallback) issues.push('区间有空档，请配置未匹配时的文字')
    })
    if (rule.fallback && !rule.fallback.text.trim()) issues.push('请填写未匹配时的文字')
  }
  return [...new Set(issues)]
}

/** Simulated author preview only: compare raw values without display rounding. */
export function matchRawScoreFeedback(config: RawScoreFeedback | undefined, scoreKey: string, value: number | null): (RawScoreFeedbackContent & { rangeKey: string | null }) | null {
  if (value === null || !Number.isFinite(value)) return null
  const rule = config?.rules.find(candidate => candidate.scoreKey === scoreKey)
  const range = rule?.ranges.find(candidate => value >= candidate.min && (value < candidate.max || (candidate.includeMax && value === candidate.max)))
  const content = range ?? rule?.fallback
  return content ? { text: content.text, images: content.images, materials:content.materials, rangeKey: range?.key ?? null } : null
}
