/**
 * SDQ Parent observer — Simplified Chinese items transcribed from authorized source PDF
 * `docs/unified-assessment-bundle-v1/source-instruments/sdq-parent-zh-hans.pdf`
 * © Robert Goodman, 2005. Response options exact: 不真实 / 有点真实 / 完全真实.
 *
 * Scoring: Goodman published subscale + total difficulties formulas (sdqinfo.org).
 * UK 4-band cut-points cited in guidance as descriptive literature only — NOT mainland CN norms.
 * This PDF has no impact supplement page → no impact score in this package.
 * Electronic admin/scoring requires Commit 9.1 approved authorization gate.
 */
import type { ScaleDefinitionV2 } from '../scale-definition'
import type { ScaleGoldenCase } from './adexi-v2'
import {
  SDQ_REVERSE_ITEM_NUMBERS,
  SDQ_SUBSCALE_ITEMS,
  describeUkFourBand,
  makeSdqItemCode,
  sdqItemCodesFor,
} from './sdq-shared'

/** Exact response option labels from sdq-parent-zh-hans.pdf */
const responseOptions = [
  { value: 'not_true', label: '不真实', score: 0 },
  { value: 'somewhat_true', label: '有点真实', score: 1 },
  { value: 'certainly_true', label: '完全真实', score: 2 },
] as const

/**
 * Exact 25 item texts transcribed from sdq-parent-zh-hans.pdf (pdftotext -layout).
 * Order matches standard SDQ item 1–25.
 */
const itemContents = [
  '能体谅到别人的感受',
  '不安定、过分活跃、不能长久静止',
  '经常抱怨头痛、肚子痛或恶心',
  '很乐意与别的小孩分享东西（糖果、玩具、笔等等）',
  '经常发脾气，易怒',
  '颇孤独，比较多自己玩',
  '一般来说比较顺从，通常是成年人要求要做的都肯做',
  '有很多担忧，经常表现出忧虑',
  '如果有人受伤、沮丧或是生病，都很乐意提供帮助',
  '当坐着时，会持续不断地摆弄手脚或扭动身子',
  '至少有一个好朋友',
  '经常与别的小孩吵架或欺负他们',
  '经常不高兴、情绪低落或哭泣',
  '一般来说，受别的小孩所喜欢',
  '容易分心，不能全神贯注',
  '在新的情况下，会紧张或爱粘人，容易失去信心',
  '对年纪小的小孩和善',
  '经常撒谎或欺骗',
  '受别的小孩作弄或欺负',
  '经常自愿地帮助别人（父母、老师或其他小孩）',
  '做事前会思考',
  '从家里、学校或其他地方偷东西',
  '跟成年人相处比跟小孩相处融洽',
  '对很多事物感到害怕，容易受惊吓',
  '做事情能做到底，注意力持久',
] as const

const reverseSet = new Set<number>(SDQ_REVERSE_ITEM_NUMBERS)
const itemCodes = itemContents.map((_, index) => makeSdqItemCode(index + 1))

const itemSource = (numbers: readonly number[]) => ({
  type: 'items' as const,
  items: sdqItemCodesFor(numbers).map((itemCode) => ({ itemCode, weight: 1 })),
  aggregation: 'sum' as const,
})

export const SDQ_PARENT_ZH_CN_V1_DEFINITION: ScaleDefinitionV2 = {
  schemaVersion: 2,
  respondentType: 'parent_observer',
  source: {
    title: '长处与困难调查表（家长）— SDQ Chinese Simplified',
    citation: 'Goodman R. Strengths and Difficulties Questionnaire © 2005. Chinese Simplified parent form transcribed from authorized PDF sdq-parent-zh-hans.pdf. Scoring: Goodman published instructions (sdqinfo.org). UK 4-band cut-points cited descriptively only.',
    url: 'https://www.sdqinfo.org/py/sdqinfo/c0.py',
    publicationYear: 2005,
  },
  license: {
    status: 'authorized',
    redistribution: 'restricted',
    note: 'Electronic administration + scoring require APPROVED InstrumentAuthorization (electronicAdministration+scoring). User authorized electronic use of attached official source PDF for this deployment.',
  },
  display: { randomizeItems: false },
  responseSets: [{ key: 'sdq_not_somewhat_certainly_zh', options: [...responseOptions] }],
  items: itemContents.map((content, index) => ({
    itemCode: makeSdqItemCode(index + 1),
    content,
    type: 'single' as const,
    required: true,
    sortOrder: index,
    responseSetKey: 'sdq_not_somewhat_certainly_zh',
    randomizeOptions: false,
  })),
  scoring: {
    scoringVersion: '1.0.0',
    itemRules: itemCodes.map((itemCode, index) => ({
      itemCode,
      transform: reverseSet.has(index + 1)
        ? { type: 'reverse' as const }
        : { type: 'identity' as const },
    })),
    defaultMissingPolicy: { type: 'complete_required' },
    scores: [
      {
        key: 'emotional',
        type: 'dimension',
        label: '情绪症状',
        description: 'Goodman Emotional symptoms scale (items 3,8,13,16,24); range 0–10.',
        direction: 'higher_is_worse',
        canonical: true,
        displayPrecision: 0,
        missingPolicy: { type: 'complete_required' },
        source: itemSource(SDQ_SUBSCALE_ITEMS.emotional),
      },
      {
        key: 'conduct',
        type: 'dimension',
        label: '品行问题',
        description: 'Goodman Conduct problems scale (items 5,7R,12,18,22); range 0–10.',
        direction: 'higher_is_worse',
        canonical: true,
        displayPrecision: 0,
        missingPolicy: { type: 'complete_required' },
        source: itemSource(SDQ_SUBSCALE_ITEMS.conduct),
      },
      {
        key: 'hyperactivity',
        type: 'dimension',
        label: '多动/注意',
        description: 'Goodman Hyperactivity/inattention scale (items 2,10,15,21R,25R); range 0–10.',
        direction: 'higher_is_worse',
        canonical: true,
        displayPrecision: 0,
        missingPolicy: { type: 'complete_required' },
        source: itemSource(SDQ_SUBSCALE_ITEMS.hyperactivity),
      },
      {
        key: 'peer',
        type: 'dimension',
        label: '同伴关系问题',
        description: 'Goodman Peer relationship problems scale (items 6,11R,14R,19,23); range 0–10.',
        direction: 'higher_is_worse',
        canonical: true,
        displayPrecision: 0,
        missingPolicy: { type: 'complete_required' },
        source: itemSource(SDQ_SUBSCALE_ITEMS.peer),
      },
      {
        key: 'prosocial',
        type: 'dimension',
        label: '亲社会行为',
        description: 'Goodman Prosocial behaviour scale (items 1,4,9,17,20); range 0–10; not included in total difficulties.',
        direction: 'higher_is_better',
        canonical: false,
        displayPrecision: 0,
        missingPolicy: { type: 'complete_required' },
        source: itemSource(SDQ_SUBSCALE_ITEMS.prosocial),
      },
      {
        key: 'total_difficulties',
        type: 'total',
        label: '困难总分',
        description: 'Sum of emotional+conduct+hyperactivity+peer (exclude prosocial); range 0–40 (Goodman).',
        direction: 'higher_is_worse',
        canonical: true,
        displayPrecision: 0,
        missingPolicy: { type: 'complete_required' },
        source: {
          type: 'scores',
          scores: [
            { scoreKey: 'emotional', weight: 1 },
            { scoreKey: 'conduct', weight: 1 },
            { scoreKey: 'hyperactivity', weight: 1 },
            { scoreKey: 'peer', weight: 1 },
          ],
          aggregation: 'sum',
        },
      },
    ],
  },
  report: {
    reportVersion: '1.0.0',
    primaryScoreKeys: ['total_difficulties', 'emotional', 'conduct', 'hyperactivity', 'peer', 'prosocial'],
    scoreOrder: ['total_difficulties', 'emotional', 'conduct', 'hyperactivity', 'peer', 'prosocial'],
    interpretations: [
      {
        scoreKey: 'total_difficulties',
        headline: 'SDQ 困难总分（描述性）',
        source: { type: 'score_only' },
        summary: (
          '家长观察报告的困难总分（情绪+品行+多动/注意+同伴，不含亲社会），范围 0–40。'
          + describeUkFourBand('parent')
        ),
        bands: [],
        guidance: [
          { category: 'reflection', text: '可回顾过去六个月或本学年哪些情境下困难更突出；本结果不作诊断。' },
          { category: 'support', text: 'WHO-5/SDQ/TEXI/ADEXI 低分或高困难分均不得自行解释为危机信号。' },
        ],
      },
      {
        scoreKey: 'emotional',
        headline: '情绪症状分（描述性）',
        source: { type: 'score_only' },
        summary: 'Goodman Emotional symptoms subscale（0–10）。英国社区四档切点可作文献对照，不作大陆临床常模。',
        bands: [],
        guidance: [{ category: 'reflection', text: '关注与担忧、躯体不适、紧张相关的观察描述。' }],
      },
      {
        scoreKey: 'conduct',
        headline: '品行问题分（描述性）',
        source: { type: 'score_only' },
        summary: 'Goodman Conduct problems subscale（0–10），含顺从条目反向计分。',
        bands: [],
        guidance: [{ category: 'reflection', text: '关注脾气、冲突、诚实与规则遵守等相关观察。' }],
      },
      {
        scoreKey: 'hyperactivity',
        headline: '多动/注意分（描述性）',
        source: { type: 'score_only' },
        summary: 'Goodman Hyperactivity/inattention subscale（0–10），含“做事前会思考”“注意力持久”反向计分。',
        bands: [],
        guidance: [{ category: 'reflection', text: '关注不安、扭动、分心与注意持久等相关观察。' }],
      },
      {
        scoreKey: 'peer',
        headline: '同伴关系问题分（描述性）',
        source: { type: 'score_only' },
        summary: 'Goodman Peer problems subscale（0–10），含好友/受欢迎条目反向计分。',
        bands: [],
        guidance: [{ category: 'reflection', text: '关注孤独、被欺负、与同伴相处等相关观察。' }],
      },
      {
        scoreKey: 'prosocial',
        headline: '亲社会行为分（描述性）',
        source: { type: 'score_only' },
        summary: 'Goodman Prosocial subscale（0–10）；不计入困难总分。分数越高表示报告的亲社会行为越多。',
        bands: [],
        guidance: [{ category: 'reflection', text: '可与困难分并列阅读，亲社会高分并不抵消困难分。' }],
      },
    ],
    limitations: [
      '严格描述性；不作诊断；不作大陆中国常模声称。',
      describeUkFourBand('parent'),
      'Source PDF has no impact supplement — impact score not claimed.',
      'Electronic admin/scoring require approved authorization.',
      'WHO-5/SDQ/TEXI/ADEXI 低分不得自行解释为危机信号。',
      '本 PR 不做 SELF/PARENT/TEACHER 跨 informant 综合或平均分。',
    ],
    disclaimer: '本量表不是诊断工具；结果仅描述本次家长观察，不能替代专业评估或医疗建议。英国社区切点仅供文献对照，不是大陆临床常模。',
  },
  referencePolicy: { type: 'none' },
}

const allCertainly = itemCodes.map((itemCode) => ({ itemCode, responseValue: 'certainly_true' }))
const allNotTrue = itemCodes.map((itemCode) => ({ itemCode, responseValue: 'not_true' }))

/** All Certainly True: difficulties items score 2 except reverse difficulties which score 0; prosocial all 2. */
export const SDQ_PARENT_ZH_CN_V1_GOLDEN_CASES: ScaleGoldenCase[] = [
  {
    name: 'all-certainly-true',
    answers: allCertainly,
    expected: {
      quality: 'interpretable',
      // emotional 3,8,13,16,24 all 2 → 10
      // conduct 5,12,18,22 = 2; 7R = 0 → 8
      // hyperactivity 2,10,15 = 2; 21R,25R = 0 → 6
      // peer 6,19,23 = 2; 11R,14R = 0 → 6
      // prosocial all 2 → 10
      // total = 10+8+6+6 = 30
      scores: {
        emotional: 10,
        conduct: 8,
        hyperactivity: 6,
        peer: 6,
        prosocial: 10,
        total_difficulties: 30,
      },
      totalScoreKeys: ['emotional', 'conduct', 'hyperactivity', 'peer', 'prosocial', 'total_difficulties'],
    },
  },
  {
    name: 'all-not-true',
    answers: allNotTrue,
    expected: {
      quality: 'interpretable',
      // emotional all 0 → 0
      // conduct 5,12,18,22=0; 7R=2 → 2
      // hyperactivity 2,10,15=0; 21R,25R=2 → 4
      // peer 6,19,23=0; 11R,14R=2 → 4
      // prosocial all 0 → 0
      // total = 0+2+4+4 = 10
      scores: {
        emotional: 0,
        conduct: 2,
        hyperactivity: 4,
        peer: 4,
        prosocial: 0,
        total_difficulties: 10,
      },
      totalScoreKeys: ['emotional', 'conduct', 'hyperactivity', 'peer', 'prosocial', 'total_difficulties'],
    },
  },
  {
    name: 'all-somewhat-true',
    answers: itemCodes.map((itemCode) => ({ itemCode, responseValue: 'somewhat_true' })),
    expected: {
      quality: 'interpretable',
      scores: {
        emotional: 5,
        conduct: 5,
        hyperactivity: 5,
        peer: 5,
        prosocial: 5,
        total_difficulties: 20,
      },
      totalScoreKeys: ['emotional', 'conduct', 'hyperactivity', 'peer', 'prosocial', 'total_difficulties'],
    },
  },
]

export const SDQ_PARENT_ZH_CN_V1_PACKAGE = {
  key: 'sdq_parent_zh_cn',
  instrumentVersion: '1.0.0',
  releaseStatus: 'DRAFT' as const,
  definition: SDQ_PARENT_ZH_CN_V1_DEFINITION,
  references: [],
  goldenCases: SDQ_PARENT_ZH_CN_V1_GOLDEN_CASES,
}
