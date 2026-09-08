/**
 * Golden text situational package: C-Responsibility (behavior-tendency channel).
 * Single scene (blueprint V03); the underlying psychological structure is
 * "无外部监督时是否主动承担并纠正错误".
 */
import type { SituationDefinitionV1 } from '../situation-definition'
import type { SituationalGoldenCase } from '../situation-scoring'

export const SJT_RESPONSIBILITY_GOLDEN_ZH_CN_V1_DEFINITION: SituationDefinitionV1 = {
  schemaVersion: 1,
  respondentType: 'participant_self_report',
  source: {
    title: '情境化人格测评黄金模板：C-Responsibility（行为倾向通道，文字版 V1）',
    citation: 'eduK12 情境化测评设计组，基于 BFI-2 Responsibility facet 的自编情境草案。',
    publicationYear: 2026,
  },
  license: {
    status: 'self_authored',
    redistribution: 'restricted',
    note: '自编情境草案；provisional key 仅用于开发期验证，不得作为常模解释依据。',
  },
  sampling: { strategy: 'ALL' },
  scenes: [{
    sceneKey: 'RS-01',
    title: '这个错误现在还没人发现',
    sortOrder: 0,
    stimulus: {
      type: 'TEXT_V1',
      text: '你刚在群里发出一份团队文件，随后发现漏掉了一行关键数据。群里已经有人回复"收到，谢谢"，另一人说"我开始用了"。目前没有人发现问题，而补发会让大家重新下载文件。光标停在输入框——画面定格。',
    },
    primaryConstruct: 'bfi2.responsibility',
    secondaryConstructs: ['bfi2.productiveness'],
    situationFeatures: { duty: 0.9, deception: 0.4 },
    channels: [{
      channelKey: 'behavior',
      purpose: 'BEHAVIOR_TENDENCY',
      responseType: 'SINGLE_CHOICE',
      scoredConstruct: 'bfi2.responsibility',
      prompt: '你最可能怎么做？',
      options: [
        { optionKey: 'A', label: '立即说明是自己的疏漏，修正并重新发送文件。' },
        { optionKey: 'B', label: '立即补发修正版，只简单说明"更新了一处数据"。' },
        { optionKey: 'C', label: '先判断这行数据是否真的会影响结果，必要时再说明。' },
        { optionKey: 'D', label: '暂时不处理，等有人问到再修正。' },
      ],
    }],
  }],
  scoring: {
    scoringVersion: 'sjt-provisional-v1',
    choiceScores: [
      { sceneKey: 'RS-01', channelKey: 'behavior', optionKey: 'A', contribution: 1.5 },
      { sceneKey: 'RS-01', channelKey: 'behavior', optionKey: 'B', contribution: 0.5 },
      { sceneKey: 'RS-01', channelKey: 'behavior', optionKey: 'C', contribution: -0.5 },
      { sceneKey: 'RS-01', channelKey: 'behavior', optionKey: 'D', contribution: -1.5 },
    ],
    publishedMetrics: [{
      key: 'bfi2.responsibility.behavior',
      label: '责任感 × 行为倾向（provisional）',
      construct: 'bfi2.responsibility',
      channelKey: 'behavior',
      direction: 'higher_is_more',
      role: 'primary',
      displayPrecision: 2,
    }],
  },
  report: {
    reportVersion: 'sjt-report-v1',
    primaryMetricKeys: ['bfi2.responsibility.behavior'],
    metricOrder: ['bfi2.responsibility.behavior'],
    interpretations: [{
      metricKey: 'bfi2.responsibility.behavior',
      headline: '责任感 × 行为倾向（情境化，provisional）',
      summary: '反映在"错误已发生但无人发现"的标准化情境中，主动承担并纠正错误的行为倾向梯度。分数为开发期 provisional 编码，不构成人格常模结论。',
      guidance: [
        { category: 'reflection', text: '可回顾自己在无人监督时发现错误后的通常处理方式。' },
      ],
      bands: [],
    }],
    limitations: [
      '严格描述性；provisional key 未经过大样本校准。',
      '结果不构成人格诊断、常模比较或选拔依据。',
    ],
    disclaimer: '本测评结果仅描述本次标准化情境中的作答选择，不能替代专业评估。',
  },
  referencePolicy: { type: 'none' },
}

export const SJT_RESPONSIBILITY_GOLDEN_ZH_CN_V1_GOLDEN_CASES: SituationalGoldenCase[] = [
  {
    name: 'strongest-repair',
    responses: [{ sceneKey: 'RS-01', channelKey: 'behavior', responseValue: 'A' }],
    expected: { quality: 'interpretable', metrics: { 'bfi2.responsibility.behavior': 1.5 }, metricKeys: ['bfi2.responsibility.behavior'] },
  },
  {
    name: 'weakest-defer',
    responses: [{ sceneKey: 'RS-01', channelKey: 'behavior', responseValue: 'D' }],
    expected: { quality: 'interpretable', metrics: { 'bfi2.responsibility.behavior': -1.5 }, metricKeys: ['bfi2.responsibility.behavior'] },
  },
  {
    name: 'missing-response',
    responses: [],
    expected: { quality: 'invalid', metrics: { 'bfi2.responsibility.behavior': null }, metricKeys: ['bfi2.responsibility.behavior'] },
  },
]

export const SJT_RESPONSIBILITY_GOLDEN_ZH_CN_V1_PACKAGE = {
  key: 'sjt-responsibility-golden',
  instrumentVersion: '1.0.0',
  releaseStatus: 'DRAFT' as const,
  scienceMaturity: 'PILOT' as const,
  definition: SJT_RESPONSIBILITY_GOLDEN_ZH_CN_V1_DEFINITION,
  goldenCases: SJT_RESPONSIBILITY_GOLDEN_ZH_CN_V1_GOLDEN_CASES,
}

