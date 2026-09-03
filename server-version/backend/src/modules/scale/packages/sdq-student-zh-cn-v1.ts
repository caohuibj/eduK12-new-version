/**
 * SDQ Student self-report — Simplified Chinese items converted from Traditional Chinese
 * source `sdq-student-hant.txt` (S 11-17 © Robert Goodman, 2005).
 * Response options match parent package style: 不真实 / 有点真实 / 完全真实.
 *
 * Scoring: Goodman published subscale + total difficulties formulas (sdqinfo.org).
 * UK 4-band cut-points are parent/teacher community bands — self-report bands differ;
 * this package cites scoring formulas only and does NOT claim UK self-report cut-points
 * as mainland CN norms.
 *
 * Source Hant form includes an impact supplement page → deferred in this v1
 * (symptoms-only package, same pattern as sdq-parent-zh-cn-v1.ts).
 * Electronic admin/scoring requires approved authorization; this draft is internal_test
 * Simplified Chinese localization pending formal signed manifest.
 */
import type { ScaleDefinitionV2 } from '../scale-definition'
import type { ScaleGoldenCase } from './adexi-v2'
import {
  SDQ_REVERSE_ITEM_NUMBERS,
  SDQ_SUBSCALE_ITEMS,
  makeSdqItemCode,
  sdqItemCodesFor,
} from './sdq-shared'

/** Response option labels aligned with sdq-parent-zh-cn-v1 (mainland Simplified). */
const responseOptions = [
  { value: 'not_true', label: '不真实', score: 0 },
  { value: 'somewhat_true', label: '有点真实', score: 1 },
  { value: 'certainly_true', label: '完全真实', score: 2 },
] as const

/**
 * 25 symptom items in standard SDQ order, first-person self-report.
 * Converted from Traditional Chinese S 11-17 source to mainland Simplified Chinese.
 * OCR quirks in Hant source corrected where meaning was clear (e.g. item 14, 18).
 */
const itemContents = [
  '我尝试对别人友善，并关心他们的感受',
  '我不能安定，不能长时间保持静止',
  '我经常头痛、肚子痛或是恶心',
  '我常与他人分享（食物、游戏、笔等等）',
  '我容易觉得很愤怒，并常发脾气',
  '我通常自己一个人，一般都是独自玩耍或不与人来往',
  '我通常依照吩咐做事',
  '我有很多担忧',
  '如有人受伤、沮丧或感到不适，我都乐意帮忙',
  '当坐着时，我持续不断地摆弄手脚或扭动身子',
  '我有一个或几个好朋友',
  '我经常与别人争斗，使别人依我想法行事',
  '我经常不快乐，心情沉重或流泪',
  '其他与我年龄相近的人一般都喜欢我',
  '我容易分心，不能全神贯注',
  '我在新的环境中会感到紧张，很容易失去自信',
  '我会友善地对待比我年纪小的孩子',
  '我常被指责说谎或不老实',
  '其他小孩或青少年常针对或欺负我',
  '我常自愿帮助别人（父母、老师、同学）',
  '我做事前会思考',
  '我从家中、学校或其他地方拿取不属于我的物件',
  '我与成年人相处较与同年龄的人相处融洽',
  '我有许多恐惧。我很易受惊吓',
  '我完成我正在做的事情。我的注意力良好',
] as const

const reverseSet = new Set<number>(SDQ_REVERSE_ITEM_NUMBERS)
const itemCodes = itemContents.map((_, index) => makeSdqItemCode(index + 1))

const itemSource = (numbers: readonly number[]) => ({
  type: 'items' as const,
  items: sdqItemCodesFor(numbers).map((itemCode) => ({ itemCode, weight: 1 })),
  aggregation: 'sum' as const,
})

export const SDQ_STUDENT_ZH_CN_V1_DEFINITION: ScaleDefinitionV2 = {
  schemaVersion: 2,
  respondentType: 'participant_self_report',
  source: {
    title: '长处与困难调查表（学生）— SDQ Chinese Simplified S 11-17',
    citation: 'Goodman R. Strengths and Difficulties Questionnaire © 2005. Student self-report Simplified Chinese converted from Traditional Chinese S 11-17 source. Scoring: Goodman published instructions (sdqinfo.org). Impact supplement deferred in this v1. Internal test localization pending formal signed manifest.',
    url: 'https://www.sdqinfo.org/py/sdqinfo/c0.py',
    publicationYear: 2005,
  },
  license: {
    status: 'authorized',
    redistribution: 'restricted',
    note: 'internal_test Simplified Chinese localization pending formal signed manifest. Electronic administration + scoring require APPROVED InstrumentAuthorization. Do not treat as final published mainland localization.',
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
        summary:
          '学生自评报告的困难总分（情绪+品行+多动/注意+同伴，不含亲社会），范围 0–40。'
          + '按 Goodman 公开计分公式汇总；不作大陆中国常模声称。源表含影响补充页，本 v1 暂不纳入影响分。',
        bands: [],
        guidance: [
          { category: 'reflection', text: '可回顾过去六个月哪些情境下困扰更突出；本结果仅描述本次自评。' },
          { category: 'support', text: 'WHO-5/SDQ/TEXI/ADEXI 低分或高困难分均不得自行解释为危机信号。' },
        ],
      },
      {
        scoreKey: 'emotional',
        headline: '情绪症状分（描述性）',
        source: { type: 'score_only' },
        summary: 'Goodman Emotional symptoms subscale（0–10）。仅作描述性阅读。',
        bands: [],
        guidance: [{ category: 'reflection', text: '关注与担忧、躯体不适、紧张相关的自我描述。' }],
      },
      {
        scoreKey: 'conduct',
        headline: '品行问题分（描述性）',
        source: { type: 'score_only' },
        summary: 'Goodman Conduct problems subscale（0–10），含顺从条目反向计分。',
        bands: [],
        guidance: [{ category: 'reflection', text: '关注脾气、冲突、诚实与规则遵守等相关自我描述。' }],
      },
      {
        scoreKey: 'hyperactivity',
        headline: '多动/注意分（描述性）',
        source: { type: 'score_only' },
        summary: 'Goodman Hyperactivity/inattention subscale（0–10），含“做事前会思考”“注意力良好”反向计分。',
        bands: [],
        guidance: [{ category: 'reflection', text: '关注不安、扭动、分心与注意持久等相关自我描述。' }],
      },
      {
        scoreKey: 'peer',
        headline: '同伴关系问题分（描述性）',
        source: { type: 'score_only' },
        summary: 'Goodman Peer problems subscale（0–10），含好友/受欢迎条目反向计分。',
        bands: [],
        guidance: [{ category: 'reflection', text: '关注孤独、被欺负、与同伴相处等相关自我描述。' }],
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
      '严格描述性；不作大陆中国常模声称。',
      'Source Hant form includes impact supplement — impact score deferred in this v1 (symptoms only).',
      'Self-report ages align with S 11-17 form; UK self-report cut-points not claimed as mainland norms.',
      'Electronic admin/scoring require approved authorization; internal_test localization pending signed manifest.',
      'WHO-5/SDQ/TEXI/ADEXI 低分不得自行解释为危机信号。',
      '本 PR 不做 SELF/PARENT/TEACHER 跨 informant 综合或平均分。',
    ],
    disclaimer: '本量表结果仅描述本次学生自评，不能替代专业评估或医疗建议。不作大陆临床常模声称。源表影响补充页未纳入本 v1。',
  },
  referencePolicy: { type: 'none' },
}

const allCertainly = itemCodes.map((itemCode) => ({ itemCode, responseValue: 'certainly_true' }))
const allNotTrue = itemCodes.map((itemCode) => ({ itemCode, responseValue: 'not_true' }))

/** All Certainly True: difficulties items score 2 except reverse difficulties which score 0; prosocial all 2. */
export const SDQ_STUDENT_ZH_CN_V1_GOLDEN_CASES: ScaleGoldenCase[] = [
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
    name: 'incomplete-missing-last-item',
    answers: allCertainly.slice(0, -1),
    expected: {
      quality: 'incomplete',
    },
  },
]

export const SDQ_STUDENT_ZH_CN_V1_PACKAGE = {
  key: 'sdq_student_zh_cn',
  instrumentVersion: '1.0.0',
  releaseStatus: 'DRAFT' as const,
  definition: SDQ_STUDENT_ZH_CN_V1_DEFINITION,
  references: [],
  goldenCases: SDQ_STUDENT_ZH_CN_V1_GOLDEN_CASES,
}
