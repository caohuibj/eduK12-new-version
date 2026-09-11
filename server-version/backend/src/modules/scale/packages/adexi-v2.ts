import type { ScaleDefinitionV2 } from '../scale-definition'

const responseOptions = [
  { value: 'never', label: '绝对不符合', score: 1 },
  { value: 'rarely', label: '不太符合', score: 2 },
  { value: 'sometimes', label: '有时符合', score: 3 },
  { value: 'often', label: '比较符合', score: 4 },
  { value: 'nearly_every_day', label: '非常符合', score: 5 },
] as const

const itemContents = [
  '我难以记住较长的指令。',
  '在一项活动进行到一半时，我有时难以记住自己正在做什么。',
  '我往往会不先考虑可能发生什么就直接做事。',
  '即使别人告诉我不可以，我有时仍难以阻止自己做喜欢的事情。',
  '别人让我做几件事时，我有时只记得第一件或最后一件。',
  '在不合适的场合，我有时难以忍住不微笑或大笑。',
  '遇到困难时，我难以想出另一种解决问题的方法。',
  '别人让我去拿某样东西时，我有时会忘记自己应该拿什么。',
  '我难以为一项活动做计划（例如出行、上班或上学时记得带齐所需物品）。',
  '我有时难以停止喜欢的活动（例如晚上到了该睡觉的时间，我仍看电视或坐在电脑前）。',
  '除非同时有人示范，否则我有时难以理解口头指令。',
  '涉及多个步骤的任务或活动对我来说比较困难。',
  '我难以提前思考或从经验中学习。',
  '我遇到的人有时似乎认为，与同龄人相比，我更活跃或更“野”。',
]

const workingMemoryItems = new Set([1, 2, 5, 7, 8, 9, 11, 12, 13])

const makeItemCode = (index: number): string => `ADEXI-${String(index).padStart(2, '0')}`

const itemCodes = itemContents.map((_, index) => makeItemCode(index + 1))

export const ADEXI_V2_DEFINITION: ScaleDefinitionV2 = {
  schemaVersion: 2,
  respondentType: 'participant_self_report',
  source: {
    title: 'ADEXI Self-Report',
    citation: 'ADEXI Self-Report instrument, authorized Chinese adaptation package',
    url: 'https://chexi.se/onewebmedia/ADEXI_SELFREPORT_ENG.pdf',
  },
  license: {
    status: 'authorized',
    redistribution: 'restricted',
    note: '按项目已取得的量表使用授权使用；授权范围由 governance/deployment 层单独管理。',
  },
  display: { randomizeItems: false },
  responseSets: [{ key: 'adexi_frequency_1_5', options: [...responseOptions] }],
  items: itemContents.map((content, index) => ({
    itemCode: makeItemCode(index + 1),
    content,
    type: 'single',
    required: true,
    sortOrder: index,
    responseSetKey: 'adexi_frequency_1_5',
    randomizeOptions: false,
  })),
  scoring: {
    scoringVersion: '2.0.0',
    itemRules: itemCodes.map((itemCode) => ({ itemCode, transform: { type: 'identity' as const } })),
    defaultMissingPolicy: { type: 'complete_required' },
    scores: [
      {
        key: 'working_memory',
        type: 'dimension',
        label: '工作记忆相关困难（自评）',
        description: '与记住、保持和处理多步骤信息有关的自评分数。',
        direction: 'higher_is_worse',
        canonical: true,
        displayPrecision: 0,
        missingPolicy: { type: 'complete_required' },
        source: {
          type: 'items',
          items: itemCodes.filter((_, index) => workingMemoryItems.has(index + 1)).map((itemCode) => ({ itemCode, weight: 1 })),
          aggregation: 'sum',
        },
      },
      {
        key: 'inhibition',
        type: 'dimension',
        label: '抑制相关困难（自评）',
        description: '与抑制冲动、停止偏好活动和抑制不合适反应有关的自评分数。',
        direction: 'higher_is_worse',
        canonical: true,
        displayPrecision: 0,
        missingPolicy: { type: 'complete_required' },
        source: {
          type: 'items',
          items: itemCodes.filter((_, index) => !workingMemoryItems.has(index + 1)).map((itemCode) => ({ itemCode, weight: 1 })),
          aggregation: 'sum',
        },
      },
    ],
  },
  report: {
    reportVersion: '2.0.0',
    primaryScoreKeys: ['working_memory', 'inhibition'],
    scoreOrder: ['working_memory', 'inhibition'],
    interpretations: [
      {
        scoreKey: 'working_memory',
        headline: '工作记忆相关困难（自评）',
        source: { type: 'score_only' },
        summary: '该分数反映本次自评中与记住、保持和处理多步骤信息有关的困难程度；分数越高表示报告的困难更多。',
        bands: [],
        guidance: [
          { category: 'reflection', text: '回顾哪些指令、步骤或情境最容易需要重复确认。' },
          { category: 'strategy', text: '可以尝试把较长指令拆成短步骤，并使用清单或外部提醒。' },
        ],
      },
      {
        scoreKey: 'inhibition',
        headline: '抑制相关困难（自评）',
        source: { type: 'score_only' },
        summary: '该分数反映本次自评中与抑制冲动、停止活动和抑制不合适反应有关的困难程度；分数越高表示报告的困难更多。',
        bands: [],
        guidance: [
          { category: 'reflection', text: '回顾哪些活动或情境中最容易出现先行动后思考或难以停止。' },
          { category: 'environment', text: '可以在需要转换活动时预留提示和缓冲时间。' },
        ],
      },
    ],
    limitations: [
      'ADEXI 结果是参与者自评的描述性分数，不代表行为任务表现。',
      '本 package 不提供群体参考、典型范围、异常判断或百分位。',
    ],
    disclaimer: '本量表不是诊断工具；结果仅描述本次自评，不能替代专业评估或医疗建议。',
  },
  referencePolicy: { type: 'none' },
}

export interface ScaleGoldenCase {
  name: string
  answers: Array<{ itemCode: string; responseValue: string | number }>
  expected: {
    quality: 'interpretable' | 'limited' | 'invalid'
    scores: Record<string, number | null>
    totalScoreKeys: string[]
  }
}

const answersFor = (value: string): Array<{ itemCode: string; responseValue: string }> => itemCodes.map((itemCode) => ({ itemCode, responseValue: value }))

export const ADEXI_V2_GOLDEN_CASES: ScaleGoldenCase[] = [
  {
    name: 'all-lowest',
    answers: answersFor('never'),
    expected: { quality: 'interpretable', scores: { working_memory: 9, inhibition: 5 }, totalScoreKeys: ['working_memory', 'inhibition'] },
  },
  {
    name: 'all-highest',
    answers: answersFor('nearly_every_day'),
    expected: { quality: 'interpretable', scores: { working_memory: 45, inhibition: 25 }, totalScoreKeys: ['working_memory', 'inhibition'] },
  },
  {
    name: 'fixed-mixed',
    answers: itemCodes.map((itemCode, index) => ({ itemCode, responseValue: responseOptions[index % responseOptions.length].value })),
    expected: { quality: 'interpretable', scores: { working_memory: 23, inhibition: 17 }, totalScoreKeys: ['working_memory', 'inhibition'] },
  },
  {
    name: 'missing-one',
    answers: answersFor('never').filter((answer) => answer.itemCode !== 'ADEXI-14'),
    expected: { quality: 'invalid', scores: { working_memory: 9, inhibition: null }, totalScoreKeys: ['working_memory', 'inhibition'] },
  },
]

export const ADEXI_V2_PACKAGE = {
  key: 'adexi_v1',
  instrumentVersion: '2.0.0',
  releaseStatus: 'PUBLISHED' as const,
  definition: ADEXI_V2_DEFINITION,
  references: [],
  goldenCases: ADEXI_V2_GOLDEN_CASES,
}
