import {materialListSchema,publicMaterial} from '../assessment-media/material'
import { z } from 'zod'
import { assessmentImagePresentationListSchema } from '../assessment-media/assessment-image-presentation'

const feedbackContent = z.object({
  materials:materialListSchema.optional(),
  text: z.string().trim().min(1).max(16000),
  images: assessmentImagePresentationListSchema.optional(),
}).strict()
export const rawScoreFeedbackSchema = z.object({
  schemaVersion: z.literal(1),
  rules: z.array(z.object({
    scoreKey: z.string().min(1),
    ranges: z.array(feedbackContent.extend({
      key: z.string().min(1), min: z.number().finite(), max: z.number().finite(),
      includeMax: z.boolean(),
    }).strict()).min(1).max(100),
    fallback: feedbackContent.optional(),
  }).strict()).max(100),
}).strict().superRefine((value, ctx) => {
  const scores = new Set<string>()
  value.rules.forEach((rule, ruleIndex) => {
    const issue = (path: (string | number)[], message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['rules', ruleIndex, ...path], message })
    if (scores.has(rule.scoreKey)) issue(['scoreKey'], '每个指标只能有一组原始分反馈')
    scores.add(rule.scoreKey)
    const keys = new Set<string>()
    rule.ranges.forEach((range, index) => {
      if (keys.has(range.key)) issue(['ranges', index, 'key'], '区间标识不能重复')
      keys.add(range.key)
      if (range.min >= range.max) issue(['ranges', index], '区间下限必须小于上限')
      if (range.includeMax && index !== rule.ranges.length - 1) issue(['ranges', index, 'includeMax'], '只有最后区间可以包含上限')
      const previous = rule.ranges[index - 1]
      if (previous && range.min < previous.max) issue(['ranges', index], '区间须按分数排序且不能重叠')
      if (previous && range.min > previous.max && !rule.fallback) issue(['fallback'], '区间有空档，请配置未匹配时的文字')
    })
  })
})
export type RawScoreFeedback = z.infer<typeof rawScoreFeedbackSchema>
export const rawScoreFeedbackMatchSchema = feedbackContent.extend({ scoreKey: z.string().min(1), rangeKey: z.string().min(1).nullable() }).strict()
export type RawScoreFeedbackMatch = z.infer<typeof rawScoreFeedbackMatchSchema>
export type PublicRawScoreFeedbackMatch=Omit<RawScoreFeedbackMatch,'materials'>&{materials?:ReturnType<typeof publicMaterial>[]}
export function projectRawScoreFeedback(matches: RawScoreFeedbackMatch[] | undefined, allowScoreDerivedLabels = true): PublicRawScoreFeedbackMatch[] {
  return (matches ?? []).flatMap(match => { const parsed = rawScoreFeedbackMatchSchema.safeParse(match); return parsed.success ? [{ ...parsed.data, ...(parsed.data.materials?{materials:parsed.data.materials.map(publicMaterial)}:{}), rangeKey: allowScoreDerivedLabels ? parsed.data.rangeKey : null }] : [] })
}
/** Display selection only. Never rounds or modifies authoritative scores. */
export function matchRawScoreFeedback(config: RawScoreFeedback | undefined, scoreKey: string, value: number | null): RawScoreFeedbackMatch | null {
  if (!config || value === null || !Number.isFinite(value)) return null
  const rule = config.rules.find(candidate => candidate.scoreKey === scoreKey)
  if (!rule) return null
  const range = rule.ranges.find(candidate => value >= candidate.min && (value < candidate.max || (candidate.includeMax && value === candidate.max)))
  const content = range ?? rule.fallback
  if (!content) return null
  return { scoreKey, rangeKey: range?.key ?? null, text: content.text, ...(content.images ? { images: content.images } : {}), ...(content.materials ? { materials:content.materials } : {}) }
}
export function rawScoreFeedbackBindingIssues(config: RawScoreFeedback | undefined, scoreKeys: readonly string[]) {
  return config?.rules.flatMap((rule, index) => scoreKeys.includes(rule.scoreKey) ? [] : [{ path: `report.rawScoreFeedback.rules.${index}.scoreKey`, message: '反馈引用了不存在的计分指标', severity: 'error' as const }]) ?? []
}
