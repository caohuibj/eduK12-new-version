/**
 * SDQ Teacher T4-10 — Simplified Chinese localization of English source package
 * `sdq-teacher-en-t4-10-v1.ts` (form T 4-10 © Robert Goodman, 2005).
 *
 * Symptom + impact content translated to mainland Simplified Chinese.
 * itemCodes, scoring formulas, SDQ_TEACHER_SCORER_KEY, and golden-case response
 * value keys remain identical to the English package (labels/content only change).
 *
 * Impact: distress + peer relations + classroom learning (0/0/1/2);
 * chronicity/burden excluded. UK teacher 4-band cited descriptively only.
 *
 * Product key `sdq_teacher_zh_cn` instrumentVersion 1.1.0 (1.0.0 = English package).
 * internal_test Simplified Chinese localization pending formal signed manifest.
 */
import type { ScaleDefinitionV2 } from '../scale-definition'
import type { ScaleGoldenCase } from './adexi-v2'
import { SDQ_TEACHER_SCORER_KEY } from './sdq-teacher-impact-scorer'
import {
  SDQ_REVERSE_ITEM_NUMBERS,
  SDQ_SUBSCALE_ITEMS,
  describeUkFourBand,
  makeSdqItemCode,
  sdqItemCodesFor,
} from './sdq-shared'

const symptomOptions = [
  { value: 'not_true', label: '不真实', score: 0 },
  { value: 'somewhat_true', label: '有点真实', score: 1 },
  { value: 'certainly_true', label: '完全真实', score: 2 },
] as const

/** 25 symptom items — Simplified Chinese from English T4-10; third-person teacher observer. */
const symptomContents = [
  '能体谅别人的感受',
  '不安定、过分活跃、不能长久静止',
  '经常抱怨头痛、肚子痛或恶心',
  '很乐意与别的小孩分享东西（例如玩具、零食、笔）',
  '经常发脾气',
  '颇孤独，比较喜欢自己玩',
  '一般来说比较顺从，通常是成年人要求要做的都肯做',
  '有很多担忧，或经常显得忧虑',
  '如果有人受伤、沮丧或感到不适，都很乐意提供帮助',
  '持续不断地摆弄手脚或扭动身子',
  '至少有一个好朋友',
  '经常与别的小孩打架或欺负他们',
  '经常不高兴、情绪低落或哭泣',
  '一般来说，受别的小孩所喜欢',
  '容易分心，注意力不集中',
  '在新的情况下会紧张或爱粘人，容易失去信心',
  '对年纪小的小孩和善',
  '经常撒谎或欺骗',
  '受别的小孩作弄或欺负',
  '经常自愿地帮助别人（父母、老师或其他小孩）',
  '做事前会思考',
  '从家里、学校或其他地方偷东西',
  '跟成年人相处比跟小孩相处融洽',
  '有许多恐惧，容易受惊吓',
  '注意力持久，做事能做到底',
] as const

/**
 * Impact supplement — same value keys / scores as English T4-10.
 * Not at all / Only a little = 0; A medium amount = 1; A great deal = 2.
 */
const impactOptions = [
  { value: 'not_at_all', label: '完全没有', score: 0 },
  { value: 'only_a_little', label: '只有一点', score: 0 },
  { value: 'a_medium_amount', label: '有一些', score: 1 },
  { value: 'a_great_deal', label: '非常多', score: 2 },
] as const

/** Overall difficulties gate — Goodman: if No, impact score = 0. */
const overallImpactOptions = [
  { value: 'no', label: '否', score: 0 },
  { value: 'yes_minor', label: '是-轻微困难', score: 0 },
  { value: 'yes_definite', label: '是-明显困难', score: 0 },
  { value: 'yes_severe', label: '是-严重困难', score: 0 },
] as const

const overallItem = {
  code: 'SDQ-IMPACT-OVERALL',
  content: '总的来说，您认为这个孩子是否在以下任何方面有困难：情绪、注意力、行为或与他人相处？',
} as const

const impactItems = [
  { code: 'SDQ-IMPACT-DISTRESS', content: '这些困难是否使孩子苦恼或痛苦？' },
  { code: 'SDQ-IMPACT-PEER', content: '这些困难是否干扰孩子在同伴关系方面的日常生活？' },
  { code: 'SDQ-IMPACT-CLASSROOM', content: '这些困难是否干扰孩子在课堂学习方面的日常生活？' },
] as const

const reverseSet = new Set<number>(SDQ_REVERSE_ITEM_NUMBERS)
const symptomCodes = symptomContents.map((_, index) => makeSdqItemCode(index + 1))

const symptomItemSource = (numbers: readonly number[]) => ({
  type: 'items' as const,
  items: sdqItemCodesFor(numbers).map((itemCode) => ({ itemCode, weight: 1 })),
  aggregation: 'sum' as const,
})

export const SDQ_TEACHER_ZH_CN_V1_DEFINITION: ScaleDefinitionV2 = {
  schemaVersion: 2,
  respondentType: 'teacher_observer',
  source: {
    title: '长处与困难调查表（教师）— SDQ Teacher T 4-10 Chinese Simplified',
    citation: 'Goodman R. SDQ Teacher form T 4-10 © 2005. Simplified Chinese localization of authorized English T4-10 items. Scoring: Goodman published instructions. UK teacher 4-band cited descriptively only. internal_test pending formal signed manifest.',
    url: 'https://www.sdqinfo.org/py/sdqinfo/c0.py',
    publicationYear: 2005,
  },
  license: {
    status: 'authorized',
    redistribution: 'restricted',
    note: 'internal_test Simplified Chinese localization pending formal signed manifest. Electronic admin/scoring require APPROVED authorization. Do not treat as final published mainland localization.',
  },
  display: { randomizeItems: false },
  responseSets: [
    { key: 'sdq_not_somewhat_certainly_zh', options: [...symptomOptions] },
    { key: 'sdq_impact_overall_zh', options: [...overallImpactOptions] },
    { key: 'sdq_impact_0_2_zh', options: [...impactOptions] },
  ],
  items: [
    ...symptomContents.map((content, index) => ({
      itemCode: makeSdqItemCode(index + 1),
      content,
      type: 'single' as const,
      required: true,
      sortOrder: index,
      responseSetKey: 'sdq_not_somewhat_certainly_zh',
      randomizeOptions: false,
    })),
    {
      itemCode: overallItem.code,
      content: overallItem.content,
      type: 'single' as const,
      required: true,
      sortOrder: 25,
      responseSetKey: 'sdq_impact_overall_zh',
      randomizeOptions: false,
    },
    ...impactItems.map((row, index) => ({
      itemCode: row.code,
      content: row.content,
      type: 'single' as const,
      required: true,
      sortOrder: 26 + index,
      responseSetKey: 'sdq_impact_0_2_zh',
      randomizeOptions: false,
    })),
  ],
  scoring: {
    scoringVersion: '1.0.0',
    scorerKey: SDQ_TEACHER_SCORER_KEY,
    itemRules: [
      ...symptomCodes.map((itemCode, index) => ({
        itemCode,
        transform: reverseSet.has(index + 1)
          ? { type: 'reverse' as const }
          : { type: 'identity' as const },
      })),
      { itemCode: overallItem.code, transform: { type: 'identity' as const } },
      ...impactItems.map((row) => ({
        itemCode: row.code,
        transform: { type: 'identity' as const },
      })),
    ],
    defaultMissingPolicy: { type: 'complete_required' },
    scores: [
      {
        key: 'emotional',
        type: 'dimension',
        label: '情绪症状',
        description: 'Goodman Emotional symptoms (0–10).',
        direction: 'higher_is_worse',
        canonical: true,
        displayPrecision: 0,
        range: { min: 0, max: 10 },
        missingPolicy: { type: 'complete_required' },
        source: symptomItemSource(SDQ_SUBSCALE_ITEMS.emotional),
      },
      {
        key: 'conduct',
        type: 'dimension',
        label: '品行问题',
        description: 'Goodman Conduct problems (0–10).',
        direction: 'higher_is_worse',
        canonical: true,
        displayPrecision: 0,
        range: { min: 0, max: 10 },
        missingPolicy: { type: 'complete_required' },
        source: symptomItemSource(SDQ_SUBSCALE_ITEMS.conduct),
      },
      {
        key: 'hyperactivity',
        type: 'dimension',
        label: '多动/注意',
        description: 'Goodman Hyperactivity/inattention (0–10).',
        direction: 'higher_is_worse',
        canonical: true,
        displayPrecision: 0,
        range: { min: 0, max: 10 },
        missingPolicy: { type: 'complete_required' },
        source: symptomItemSource(SDQ_SUBSCALE_ITEMS.hyperactivity),
      },
      {
        key: 'peer',
        type: 'dimension',
        label: '同伴关系问题',
        description: 'Goodman Peer problems (0–10).',
        direction: 'higher_is_worse',
        canonical: true,
        displayPrecision: 0,
        range: { min: 0, max: 10 },
        missingPolicy: { type: 'complete_required' },
        source: symptomItemSource(SDQ_SUBSCALE_ITEMS.peer),
      },
      {
        key: 'prosocial',
        type: 'dimension',
        label: '亲社会行为',
        description: 'Goodman Prosocial (0–10); excluded from total difficulties.',
        direction: 'higher_is_better',
        canonical: false,
        displayPrecision: 0,
        range: { min: 0, max: 10 },
        missingPolicy: { type: 'complete_required' },
        source: symptomItemSource(SDQ_SUBSCALE_ITEMS.prosocial),
      },
      {
        key: 'total_difficulties',
        type: 'total',
        label: '困难总分',
        description: 'Sum of emotional+conduct+hyperactivity+peer (0–40).',
        direction: 'higher_is_worse',
        canonical: true,
        displayPrecision: 0,
        range: { min: 0, max: 40 },
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
      {
        key: 'impact',
        type: 'dimension',
        label: '影响分（教师）',
        description: 'Goodman teacher impact: distress + peer + classroom (0–6). When overall difficulties answered No, score impact items as Not at all (0) per Goodman.',
        direction: 'higher_is_worse',
        canonical: false,
        displayPrecision: 0,
        range: { min: 0, max: 6 },
        missingPolicy: { type: 'complete_required' },
        source: {
          type: 'items',
          items: impactItems.map((row) => ({ itemCode: row.code, weight: 1 })),
          aggregation: 'sum',
        },
      },
    ],
  },
  report: {
    reportVersion: '1.0.0',
    primaryScoreKeys: ['total_difficulties', 'emotional', 'conduct', 'hyperactivity', 'peer', 'prosocial', 'impact'],
    scoreOrder: ['total_difficulties', 'emotional', 'conduct', 'hyperactivity', 'peer', 'prosocial', 'impact'],
    interpretations: [
      {
        scoreKey: 'total_difficulties',
        headline: 'SDQ 困难总分（描述性）',
        source: { type: 'score_only' },
        summary: `教师 T4-10 困难总分（0–40）。${describeUkFourBand('teacher')} 适用年龄 4–10 岁。internal_test 简体本地化，正式签署清单前不作终稿声称。`,
        bands: [],
        guidance: [
          { category: 'reflection', text: '请依据过去六个月或本学年的观察作答（表头说明）。' },
          { category: 'support', text: '低分或高困难分本身不是危机信号；结果仅描述本次教师观察。' },
        ],
      },
      {
        scoreKey: 'emotional',
        headline: '情绪症状分（描述性）',
        source: { type: 'score_only' },
        summary: 'Goodman Emotional symptoms subscale（0–10）。英国切点仅供文献对照，不作大陆常模。',
        bands: [],
        guidance: [],
      },
      {
        scoreKey: 'conduct',
        headline: '品行问题分（描述性）',
        source: { type: 'score_only' },
        summary: 'Goodman Conduct problems subscale（0–10）。',
        bands: [],
        guidance: [],
      },
      {
        scoreKey: 'hyperactivity',
        headline: '多动/注意分（描述性）',
        source: { type: 'score_only' },
        summary: 'Goodman Hyperactivity/inattention subscale（0–10）。',
        bands: [],
        guidance: [],
      },
      {
        scoreKey: 'peer',
        headline: '同伴关系问题分（描述性）',
        source: { type: 'score_only' },
        summary: 'Goodman Peer relationship problems subscale（0–10）。',
        bands: [],
        guidance: [],
      },
      {
        scoreKey: 'prosocial',
        headline: '亲社会行为分（描述性）',
        source: { type: 'score_only' },
        summary: 'Goodman Prosocial subscale（0–10）；不计入困难总分。',
        bands: [],
        guidance: [],
      },
      {
        scoreKey: 'impact',
        headline: '教师影响分（描述性）',
        source: { type: 'score_only' },
        summary: 'Goodman 教师影响分（苦恼 + 同伴关系 + 课堂学习；0–6）。慢性与负担不计分。若总体困难回答「否」，影响分通常为 0。',
        bands: [],
        guidance: [],
      },
    ],
    limitations: [
      'internal_test Simplified Chinese localization pending formal signed manifest.',
      'Form code T 4-10 → subject ages 4–10 for this package.',
      describeUkFourBand('teacher'),
      'Not mainland CN clinical norms.',
      'Electronic admin/scoring require approved authorization.',
      'No cross-informant synthesis in this PR.',
    ],
    disclaimer: '本量表结果仅描述本次教师观察，不能替代专业评估或医疗建议。英国社区切点仅供文献对照，不是大陆临床常模。本包为 internal_test 简体本地化草稿。',
  },
  referencePolicy: { type: 'none' },
}

const allCertainly = symptomCodes.map((itemCode) => ({ itemCode, responseValue: 'certainly_true' }))

export const SDQ_TEACHER_ZH_CN_V1_GOLDEN_CASES: ScaleGoldenCase[] = [
  {
    name: 'symptoms-all-certainly-impact-zero',
    answers: [
      ...allCertainly,
      { itemCode: 'SDQ-IMPACT-OVERALL', responseValue: 'yes_minor' },
      { itemCode: 'SDQ-IMPACT-DISTRESS', responseValue: 'not_at_all' },
      { itemCode: 'SDQ-IMPACT-PEER', responseValue: 'not_at_all' },
      { itemCode: 'SDQ-IMPACT-CLASSROOM', responseValue: 'not_at_all' },
    ],
    expected: {
      quality: 'interpretable',
      scores: {
        emotional: 10,
        conduct: 8,
        hyperactivity: 6,
        peer: 6,
        prosocial: 10,
        total_difficulties: 30,
        impact: 0,
      },
      totalScoreKeys: ['emotional', 'conduct', 'hyperactivity', 'peer', 'prosocial', 'total_difficulties', 'impact'],
    },
  },
  {
    name: 'symptoms-somewhat-impact-great',
    answers: [
      ...symptomCodes.map((itemCode) => ({ itemCode, responseValue: 'somewhat_true' })),
      { itemCode: 'SDQ-IMPACT-OVERALL', responseValue: 'yes_definite' },
      { itemCode: 'SDQ-IMPACT-DISTRESS', responseValue: 'a_great_deal' },
      { itemCode: 'SDQ-IMPACT-PEER', responseValue: 'a_great_deal' },
      { itemCode: 'SDQ-IMPACT-CLASSROOM', responseValue: 'a_medium_amount' },
    ],
    expected: {
      quality: 'interpretable',
      scores: {
        emotional: 5,
        conduct: 5,
        hyperactivity: 5,
        peer: 5,
        prosocial: 5,
        total_difficulties: 20,
        impact: 5,
      },
      totalScoreKeys: ['emotional', 'conduct', 'hyperactivity', 'peer', 'prosocial', 'total_difficulties', 'impact'],
    },
  },
  {
    // Goodman gate: overall=No forces impact=0 even when impact items are elevated.
    name: 'overall-no-gates-impact-to-zero',
    answers: [
      ...symptomCodes.map((itemCode) => ({ itemCode, responseValue: 'somewhat_true' })),
      { itemCode: 'SDQ-IMPACT-OVERALL', responseValue: 'no' },
      { itemCode: 'SDQ-IMPACT-DISTRESS', responseValue: 'a_great_deal' },
      { itemCode: 'SDQ-IMPACT-PEER', responseValue: 'a_great_deal' },
      { itemCode: 'SDQ-IMPACT-CLASSROOM', responseValue: 'a_great_deal' },
    ],
    expected: {
      quality: 'interpretable',
      scores: {
        emotional: 5,
        conduct: 5,
        hyperactivity: 5,
        peer: 5,
        prosocial: 5,
        total_difficulties: 20,
        impact: 0,
      },
      totalScoreKeys: ['emotional', 'conduct', 'hyperactivity', 'peer', 'prosocial', 'total_difficulties', 'impact'],
    },
  },
  {
    name: 'incomplete-missing-impact-item',
    answers: [
      ...allCertainly,
      { itemCode: 'SDQ-IMPACT-OVERALL', responseValue: 'yes_minor' },
      { itemCode: 'SDQ-IMPACT-DISTRESS', responseValue: 'not_at_all' },
      // missing PEER + CLASSROOM
    ],
    expected: {
      quality: 'incomplete',
    },
  },
]

export const SDQ_TEACHER_ZH_CN_V1_PACKAGE = {
  key: 'sdq_teacher_zh_cn',
  instrumentVersion: '1.1.0',
  releaseStatus: 'DRAFT' as const,
  definition: SDQ_TEACHER_ZH_CN_V1_DEFINITION,
  references: [],
  goldenCases: SDQ_TEACHER_ZH_CN_V1_GOLDEN_CASES,
}
