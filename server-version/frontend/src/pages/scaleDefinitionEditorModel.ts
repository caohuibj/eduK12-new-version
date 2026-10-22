import type {OrderedAuthoringImage} from '../modules/assessment-media/AssessmentImageField'
import type { RawScoreFeedback } from '../modules/scale/rawScoreFeedback'
export type ResponseValue = string | number
export const responseValueToken = (value: ResponseValue): string => JSON.stringify(value)
export type Direction = 'higher_is_better' | 'higher_is_worse' | 'higher_is_more' | 'lower_is_better' | 'bipolar' | 'descriptive'
export type Aggregation = 'sum' | 'mean'

export interface ResponseOption {
  value: ResponseValue
  label: string
  score: number
}

export interface ScaleDefinition {
  schemaVersion: 2
  respondentType: string
  source: { title?: string; citation?: string; url?: string; publicationYear?: number }
  license: { status: 'self_authored' | 'authorized' | 'verified' | 'unknown'; redistribution: 'allowed' | 'restricted' | 'unknown'; note?: string }
  display: { randomizeItems: boolean }
  responseSets: Array<{ key: string; options: ResponseOption[] }>
  items: Array<{ images?: OrderedAuthoringImage[]; itemCode: string; content: string; type: string; required: boolean; sortOrder: number; responseSetKey: string; randomizeOptions: boolean; purpose?: 'CONTENT' | 'ATTENTION_CHECK' | 'SOCIAL_DESIRABILITY'; attentionTarget?: ResponseValue }>
  scoring: {
    scoringVersion: string
    itemRules: Array<{ itemCode: string; transform: { type: 'identity' | 'reverse' } }>
    defaultMissingPolicy: { type: 'complete_required' }
    scores: Array<{
      key: string
      type: 'total' | 'dimension'
      label: string
      description?: string
      direction: Direction
      canonical: boolean
      displayPrecision: number
      source: { type: 'items'; items: Array<{ itemCode: string; weight: number }>; aggregation: Aggregation }
    }>
  }
  report: {
    rawScoreFeedback?: RawScoreFeedback
    reportVersion: string
    primaryScoreKeys: string[]
    scoreOrder: string[]
    interpretations: Array<{ scoreKey: string; headline: string; source: { type: 'score_only' }; summary: string; bands: []; guidance: [] }>
    limitations: string[]
    disclaimer: string
  }
  referencePolicy: { type: 'none' }
}

export const emptyDefinition = (): ScaleDefinition => ({
  schemaVersion: 2,
  respondentType: 'participant_self_report',
  source: { title: '教师自建内容' },
  license: { status: 'self_authored', redistribution: 'allowed' },
  display: { randomizeItems: false },
  responseSets: [{ key: 'default', options: [
    { value: 'option_1', label: '选项 1', score: 1 },
    { value: 'option_2', label: '选项 2', score: 2 },
    { value: 'option_3', label: '选项 3', score: 3 },
    { value: 'option_4', label: '选项 4', score: 4 },
    { value: 'option_5', label: '选项 5', score: 5 },
  ] }],
  items: [],
  scoring: { scoringVersion: '2.0.0', itemRules: [], defaultMissingPolicy: { type: 'complete_required' }, scores: [] },
  report: { reportVersion: 'scale-report-v2', primaryScoreKeys: [], scoreOrder: [], interpretations: [], limitations: ['这是自定义描述性量表结果，不提供人口常模或诊断结论。'], disclaimer: '量表结果仅反映本次作答，不构成医学诊断或人口常模。' },
  referencePolicy: { type: 'none' },
})

export const normalizeDefinition = (raw: any): ScaleDefinition => {
  const base = emptyDefinition()
  if (!raw || raw.schemaVersion !== 2) return base
  return {
    ...base,
    ...raw,
    source: { ...base.source, ...(raw.source || {}) },
    license: { ...base.license, ...(raw.license || {}) },
    display: { ...base.display, ...(raw.display || {}) },
    responseSets: Array.isArray(raw.responseSets) && raw.responseSets.length > 0 ? raw.responseSets : base.responseSets,
    items: raw.items || [],
    scoring: {
      ...base.scoring,
      ...(raw.scoring || {}),
      itemRules: raw.scoring?.itemRules || [],
      scores: raw.scoring?.scores || [],
      defaultMissingPolicy: { type: 'complete_required' },
    },
    report: { ...base.report, ...(raw.report || {}) },
    referencePolicy: { type: 'none' },
  }
}

export const scoreSourceFor = (definition: ScaleDefinition, scoreKey: string) => {
  const score = definition.scoring.scores.find((candidate) => candidate.key === scoreKey)
  return score?.source.type === 'items' ? score.source.items : []
}

export const updateReportContract = (definition: ScaleDefinition): ScaleDefinition => {
  const keys = definition.scoring.scores.map((score) => score.key)
  const interpretations = definition.scoring.scores.map((score) => {
    const existing = definition.report.interpretations.find((candidate) => candidate.scoreKey === score.key)
    return existing || { scoreKey: score.key, headline: score.label, source: { type: 'score_only' as const }, summary: `${score.label}为描述性结果，请结合题目内容和实际情境理解。`, bands: [] as [], guidance: [] as [] }
  })
  return {
    ...definition,
    report: {
      ...definition.report,
      primaryScoreKeys: definition.scoring.scores.filter((score) => score.canonical).map((score) => score.key),
      scoreOrder: keys,
      interpretations,
      ...(definition.report.rawScoreFeedback ? { rawScoreFeedback: { ...definition.report.rawScoreFeedback, rules: definition.report.rawScoreFeedback.rules.filter(rule => keys.includes(rule.scoreKey)) } } : {}),
    } as ScaleDefinition['report'],
  }
}

