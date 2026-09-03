/**
 * WHO-5 Well-Being Index (Chinese PR characters) Scale package.
 * Item text transcribed from official WHO CDN PDF:
 * https://cdn.who.int/media/docs/default-source/mental-health/five-well-being-index-(who-5)/who5_chinese_pr.pdf
 * Source publication: WHO-UCN-MSD-MHE-2024.01 (CC BY-NC-SA 3.0 IGO).
 * Descriptive only — not Chinese norms, not diagnosis, low scores ≠ crisis.
 */
import type { ScaleDefinitionV2 } from '../scale-definition'
import type { ScaleGoldenCase } from './adexi-v2'

const responseOptions = [
  { value: 'all_the_time', label: '所有时间', score: 5 },
  { value: 'most_of_the_time', label: '大部分时间', score: 4 },
  { value: 'more_than_half', label: '超过一半的时间', score: 3 },
  { value: 'less_than_half', label: '少于一半的时间', score: 2 },
  { value: 'some_of_the_time', label: '有时候', score: 1 },
  { value: 'at_no_time', label: '从未有过', score: 0 },
] as const

/** Official Simplified Chinese (PR China characters) item texts — WHO Chinese PR PDF. */
const itemContents = [
  '我感觉快乐、心情舒畅',
  '我感觉宁静和放松',
  '我感觉充满活力、精力充沛',
  '我睡醒时感到清新、得到了足够休息',
  '我每天生活充满了有趣的事情',
] as const

const makeItemCode = (index: number): string => `WHO5-${String(index).padStart(2, '0')}`
const itemCodes = itemContents.map((_, index) => makeItemCode(index + 1))

export const WHO5_ZH_CN_V1_DEFINITION: ScaleDefinitionV2 = {
  schemaVersion: 2,
  respondentType: 'participant_self_report',
  source: {
    title: 'WHO 世界卫生组织五项身心健康指标（1998 年版）— Chinese PR',
    citation: 'World Health Organization. The World Health Organization-Five Well-Being Index (WHO-5). WHO/UCN/MSD/MHE/2024.1; Chinese PR characters version (Sept 2007) hosted on WHO CDN.',
    url: 'https://www.who.int/publications/m/item/WHO-UCN-MSD-MHE-2024.01',
    publicationYear: 2024,
  },
  license: {
    status: 'authorized',
    redistribution: 'restricted',
    note: 'CC BY-NC-SA 3.0 IGO — non-commercial only; keep nonCommercialOnly publication gate.',
  },
  display: { randomizeItems: false },
  responseSets: [{ key: 'who5_frequency_0_5', options: [...responseOptions] }],
  items: itemContents.map((content, index) => ({
    itemCode: makeItemCode(index + 1),
    content,
    type: 'single',
    required: true,
    sortOrder: index,
    responseSetKey: 'who5_frequency_0_5',
    randomizeOptions: false,
  })),
  scoring: {
    scoringVersion: '1.0.0',
    itemRules: itemCodes.map((itemCode) => ({ itemCode, transform: { type: 'identity' as const } })),
    defaultMissingPolicy: { type: 'complete_required' },
    scores: [
      {
        key: 'raw_total',
        type: 'total',
        label: 'WHO-5 原始分',
        description: '五项答案分值之和，范围 0–25。',
        direction: 'higher_is_better',
        canonical: true,
        displayPrecision: 0,
        missingPolicy: { type: 'complete_required' },
        source: {
          type: 'items',
          items: itemCodes.map((itemCode) => ({ itemCode, weight: 1 })),
          aggregation: 'sum',
        },
      },
      {
        key: 'percentage',
        type: 'dimension',
        label: 'WHO-5 百分制分',
        description: '原始分 × 4，范围 0–100。描述性分数，不作中国常模或诊断结论。',
        direction: 'higher_is_better',
        canonical: false,
        displayPrecision: 0,
        missingPolicy: { type: 'complete_required' },
        source: {
          type: 'scores',
          scores: [{ scoreKey: 'raw_total', weight: 4 }],
          aggregation: 'sum',
        },
      },
    ],
  },
  report: {
    reportVersion: '1.0.0',
    primaryScoreKeys: ['raw_total', 'percentage'],
    scoreOrder: ['raw_total', 'percentage'],
    interpretations: [
      {
        scoreKey: 'raw_total',
        headline: 'WHO-5 原始分（描述性）',
        source: { type: 'score_only' },
        summary: '反映过去两周自评的身心健康相关感受；分数越高表示报告的良好感受越多。本结果不作诊断。',
        bands: [],
        guidance: [
          { category: 'reflection', text: '可回顾过去两周哪些情境让你感觉更好或更差。' },
          { category: 'support', text: '若持续感到困扰，可向可信赖的成人或专业人员求助；低分本身不等于危机。' },
        ],
      },
      {
        scoreKey: 'percentage',
        headline: 'WHO-5 百分制分（描述性）',
        source: { type: 'score_only' },
        summary: '由原始分乘以 4 得到的描述性百分制分数；不是中国常模或诊断阈值。',
        bands: [],
        guidance: [
          { category: 'reflection', text: '可与自己过往测评对比感受变化，勿与他人简单比较。' },
        ],
      },
    ],
    limitations: [
      '严格描述性；不作诊断、不作中国常模声称。',
      'WHO-5/SDQ/TEXI/ADEXI 低分不得自行解释为危机信号。',
      '仅非商业部署可发布（CC BY-NC-SA 3.0 IGO）。',
    ],
    disclaimer: '本量表不是诊断工具；结果仅描述本次自评，不能替代专业评估或医疗建议。',
  },
  referencePolicy: { type: 'none' },
}

const answersFor = (value: string): Array<{ itemCode: string; responseValue: string }> => (
  itemCodes.map((itemCode) => ({ itemCode, responseValue: value }))
)

export const WHO5_ZH_CN_V1_GOLDEN_CASES: ScaleGoldenCase[] = [
  {
    name: 'all-highest',
    answers: answersFor('all_the_time'),
    expected: { quality: 'interpretable', scores: { raw_total: 25, percentage: 100 }, totalScoreKeys: ['raw_total', 'percentage'] },
  },
  {
    name: 'all-lowest',
    answers: answersFor('at_no_time'),
    expected: { quality: 'interpretable', scores: { raw_total: 0, percentage: 0 }, totalScoreKeys: ['raw_total', 'percentage'] },
  },
  {
    name: 'mid-mixed',
    answers: [
      { itemCode: 'WHO5-01', responseValue: 'all_the_time' },
      { itemCode: 'WHO5-02', responseValue: 'most_of_the_time' },
      { itemCode: 'WHO5-03', responseValue: 'more_than_half' },
      { itemCode: 'WHO5-04', responseValue: 'less_than_half' },
      { itemCode: 'WHO5-05', responseValue: 'some_of_the_time' },
    ],
    expected: { quality: 'interpretable', scores: { raw_total: 15, percentage: 60 }, totalScoreKeys: ['raw_total', 'percentage'] },
  },
  {
    name: 'missing-one',
    answers: answersFor('most_of_the_time').filter((row) => row.itemCode !== 'WHO5-05'),
    expected: { quality: 'invalid', scores: { raw_total: null, percentage: null }, totalScoreKeys: ['raw_total', 'percentage'] },
  },
]

export const WHO5_ZH_CN_V1_PACKAGE = {
  key: 'who5',
  instrumentVersion: '1.0.0',
  releaseStatus: 'DRAFT' as const,
  definition: WHO5_ZH_CN_V1_DEFINITION,
  references: [],
  goldenCases: WHO5_ZH_CN_V1_GOLDEN_CASES,
}
