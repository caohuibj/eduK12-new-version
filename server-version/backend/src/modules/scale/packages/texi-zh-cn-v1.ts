/**
 * TEXI (Teenage Executive Functioning Inventory) — Parents and Teachers
 * Simplified Chinese localization of English source `texi-en-v1.ts`.
 *
 * 20 items + Likert labels translated to mainland Simplified Chinese.
 * Values remain '1'..'5'; scoring identical to EN (WM + Inhibition means).
 * Ages 13–19. Descriptive only — no mainland CN norms.
 *
 * Product keys `texi_parent_zh_cn` / `texi_teacher_zh_cn` instrumentVersion 1.1.0
 * (1.0.0 = English packages). internal_test pending formal signed manifest.
 */
import type { ScaleDefinitionV2 } from '../scale-definition'
import type { ScaleGoldenCase } from './adexi-v2'

export const TEXI_ZH_CN_SOURCE_VERSION_LABEL = 'Thorell et al. 2020 / ages 13-19 / zh-CN internal_test' as const
export const TEXI_ZH_CN_SUBJECT_AGE_MIN = 13
export const TEXI_ZH_CN_SUBJECT_AGE_MAX = 19

/** Likert labels — Simplified Chinese; values stay '1'..'5'. */
const responseOptions = [
  { value: '1', label: '完全不符合', score: 1 },
  { value: '2', label: '不符合', score: 2 },
  { value: '3', label: '部分符合', score: 3 },
  { value: '4', label: '符合', score: 4 },
  { value: '5', label: '完全符合', score: 5 },
] as const

/**
 * 20 parent/teacher observer items — Simplified Chinese from English TEXI.
 * Third-person; he/she → 他/她. Item codes TEXI-01..20 unchanged.
 */
const itemContents = [
  '难以记住冗长的指令',
  '有时在活动进行到一半时，难以想起自己需要做什么',
  '有做事不先思考可能后果的倾向',
  '即使被告知不允许，也难以停止某项活动',
  '当有人要求他/她做几件事时，有时无法全部记住',
  '有时在不合适的场合难以忍住不笑或不微笑',
  '当卡住时，难以想出新的方法来解决问题',
  '当被要求去取某样东西时，有时会忘记要取什么',
  '觉得规划事情有困难（例如：记得带齐上学或出行所需的物品）',
  '难以在自己喜欢的活动中停下来（例如：即使到了该睡觉的时间，仍坐在电脑/手机前）',
  '有时除非同时示范如何做，否则难以理解指令',
  '对需要按一定顺序完成多个步骤的任务感到困难',
  '难以从自己的错误中学习（例如：反复犯同样的错误）',
  '与同龄人相比显得更活泼/更野',
  '难以激励自己去做自己不喜欢做的事情',
  '如果被自己喜欢的事物分心，就难以开始一项任务（例如：没有开始做功课，而是使用手机）',
  '当被要求停止时，难以停止某项活动',
  '如果发生特别的事情，往往比同龄人更兴奋（例如：聚会、旅行、生日、赢了电脑游戏）',
  '无法完成已经开始的事情',
  '把事情拖到最后一刻才做',
] as const

/** Working Memory factor items (1-based) — same as EN / official TEXI subscales */
const TEXI_WORKING_MEMORY_ITEMS = [1, 2, 5, 7, 8, 9, 11, 12, 13] as const
/** Inhibition factor — same as EN */
const TEXI_INHIBITION_ITEMS = [3, 4, 6, 10, 14, 15, 16, 17, 18, 19, 20] as const

const makeTexiItemCode = (index: number): string => `TEXI-${String(index).padStart(2, '0')}`

const itemCodes = itemContents.map((_, index) => makeTexiItemCode(index + 1))

const meanSource = (numbers: readonly number[]) => ({
  type: 'items' as const,
  items: numbers.map((n) => ({ itemCode: makeTexiItemCode(n), weight: 1 })),
  aggregation: 'mean' as const,
})

const buildDefinition = (respondentType: 'parent_observer' | 'teacher_observer'): ScaleDefinitionV2 => ({
  schemaVersion: 2,
  respondentType,
  source: {
    title: '青少年执行功能量表（TEXI）— 家长/教师简体中文',
    citation: 'Thorell LB, et al. Psychometric properties of the Teenage Executive Functioning Inventory (TEXI). Child Neuropsychology. 2020. PMID 32090688. Simplified Chinese localization of English parent/teacher form; ages 13–19. internal_test pending formal signed manifest.',
    url: 'https://pubmed.ncbi.nlm.nih.gov/32090688/',
    publicationYear: 2020,
  },
  license: {
    status: 'authorized',
    redistribution: 'restricted',
    note: 'internal_test Simplified Chinese localization pending formal signed manifest. Descriptive only — no mainland norms. Do not treat as final published mainland localization.',
  },
  display: { randomizeItems: false },
  responseSets: [{ key: 'texi_likert_1_5_zh', options: [...responseOptions] }],
  items: itemContents.map((content, index) => ({
    itemCode: makeTexiItemCode(index + 1),
    content,
    type: 'single' as const,
    required: true,
    sortOrder: index,
    responseSetKey: 'texi_likert_1_5_zh',
    randomizeOptions: false,
  })),
  scoring: {
    scoringVersion: '1.0.0',
    itemRules: itemCodes.map((itemCode) => ({ itemCode, transform: { type: 'identity' as const } })),
    defaultMissingPolicy: { type: 'complete_required' },
    scores: [
      {
        key: 'working_memory',
        type: 'dimension',
        label: '工作记忆（均分）',
        description: 'Official TEXI Working Memory factor mean (items 1,2,5,7,8,9,11,12,13); higher = more reported difficulty.',
        direction: 'higher_is_worse',
        canonical: true,
        displayPrecision: 2,
        missingPolicy: { type: 'complete_required' },
        source: meanSource(TEXI_WORKING_MEMORY_ITEMS),
      },
      {
        key: 'inhibition',
        type: 'dimension',
        label: '抑制（均分）',
        description: 'Official TEXI Inhibition factor mean (items 3,4,6,10,14–20); higher = more reported difficulty.',
        direction: 'higher_is_worse',
        canonical: true,
        displayPrecision: 2,
        missingPolicy: { type: 'complete_required' },
        source: meanSource(TEXI_INHIBITION_ITEMS),
      },
      {
        key: 'total_mean',
        type: 'total',
        label: 'TEXI 总均分',
        description: 'Mean of all 20 items (descriptive composite; primary published factors are WM + Inhibition).',
        direction: 'higher_is_worse',
        canonical: false,
        displayPrecision: 2,
        missingPolicy: { type: 'complete_required' },
        source: meanSource([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]),
      },
    ],
  },
  report: {
    reportVersion: '1.0.0',
    primaryScoreKeys: ['working_memory', 'inhibition', 'total_mean'],
    scoreOrder: ['working_memory', 'inhibition', 'total_mean'],
    interpretations: [
      {
        scoreKey: 'working_memory',
        headline: 'TEXI 工作记忆（描述性均分）',
        source: { type: 'score_only' },
        summary: '工作记忆条目均分（1–5 Likert）。Thorell et al. 2020 瑞典青少年样本家长评定 WM 均分约 ~2.0–2.1；仅供文献对照，不作大陆常模声称。',
        bands: [],
        guidance: [
          { category: 'reflection', text: '可回顾报告者提到的冗长指令、多步骤任务与计划情境。' },
          { category: 'strategy', text: '可考虑外部记忆辅助与更短的指令分块——属教育策略提示，非治疗声称。' },
        ],
      },
      {
        scoreKey: 'inhibition',
        headline: 'TEXI 抑制（描述性均分）',
        source: { type: 'score_only' },
        summary: '抑制条目均分，含青少年版新增的启动、完成与拖延条目（Thorell et al. 2020）。验证样本家长评定抑制均分约 ~2.7–2.8；仅供文献对照，不作大陆常模。',
        bands: [],
        guidance: [
          { category: 'reflection', text: '可回顾停止偏好活动、冲动控制与任务启动/完成相关观察。' },
          { category: 'environment', text: '切换活动时可考虑提示与缓冲——非临床切点。' },
        ],
      },
      {
        scoreKey: 'total_mean',
        headline: 'TEXI 总均分（描述性）',
        source: { type: 'score_only' },
        summary: '全部 20 题均分。按已发表结构，优先分别阅读工作记忆与抑制因子。',
        bands: [],
        guidance: [],
      },
    ],
    limitations: [
      'internal_test Simplified Chinese localization pending formal signed manifest.',
      'Ages 13–19 only (Thorell et al. 2020).',
      'Descriptive only — no mainland CN norms, no convergence claims.',
      'WHO-5/SDQ/TEXI/ADEXI 低分不得自行解释为危机信号。',
      'No cross-informant synthesis in this PR.',
    ],
    disclaimer: 'TEXI 结果仅为知情者评定的描述性分数，不能替代专业评估或医疗建议。本包为 internal_test 简体本地化草稿；不作大陆中国常模声称。',
  },
  referencePolicy: { type: 'none' },
})

const answersAll = (value: string) => itemCodes.map((itemCode) => ({ itemCode, responseValue: value }))

export const TEXI_ZH_CN_V1_GOLDEN_CASES: ScaleGoldenCase[] = [
  {
    name: 'all-definitely-true',
    answers: answersAll('5'),
    expected: {
      quality: 'interpretable',
      scores: { working_memory: 5, inhibition: 5, total_mean: 5 },
      totalScoreKeys: ['working_memory', 'inhibition', 'total_mean'],
    },
  },
  {
    name: 'all-definitely-not-true',
    answers: answersAll('1'),
    expected: {
      quality: 'interpretable',
      scores: { working_memory: 1, inhibition: 1, total_mean: 1 },
      totalScoreKeys: ['working_memory', 'inhibition', 'total_mean'],
    },
  },
  {
    name: 'all-partially-true',
    answers: answersAll('3'),
    expected: {
      quality: 'interpretable',
      scores: { working_memory: 3, inhibition: 3, total_mean: 3 },
      totalScoreKeys: ['working_memory', 'inhibition', 'total_mean'],
    },
  },
  {
    // Asymmetric: only item 13 (WM) elevated — Inhibition unchanged.
    name: 'only-item-13-elevated',
    answers: itemCodes.map((itemCode) => ({
      itemCode,
      responseValue: itemCode === makeTexiItemCode(13) ? '5' : '1',
    })),
    expected: {
      quality: 'interpretable',
      scores: {
        working_memory: 13 / 9,
        inhibition: 1,
        total_mean: 1.2,
      },
      totalScoreKeys: ['working_memory', 'inhibition', 'total_mean'],
    },
  },
  {
    name: 'incomplete-missing-last-item',
    answers: answersAll('5').slice(0, -1),
    expected: {
      quality: 'incomplete',
    },
  },
]

export const TEXI_PARENT_ZH_CN_V1_PACKAGE = {
  key: 'texi_parent_zh_cn',
  instrumentVersion: '1.1.0',
  releaseStatus: 'DRAFT' as const,
  definition: buildDefinition('parent_observer'),
  references: [],
  goldenCases: TEXI_ZH_CN_V1_GOLDEN_CASES,
}

export const TEXI_TEACHER_ZH_CN_V1_PACKAGE = {
  key: 'texi_teacher_zh_cn',
  instrumentVersion: '1.1.0',
  releaseStatus: 'DRAFT' as const,
  definition: buildDefinition('teacher_observer'),
  references: [],
  goldenCases: TEXI_ZH_CN_V1_GOLDEN_CASES,
}
