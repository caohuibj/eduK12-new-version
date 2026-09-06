/**
 * Golden text situational package: E-Assertiveness (behavior-tendency channel).
 * Two scenes with the same trait-expression gradient exercise mean aggregation
 * across scenes. Self-authored drafts adapted from the team's scene blueprint
 * (V01 + workplace variant); provisional keys are development-time encodings,
 * not calibrated item parameters.
 */
import type { SituationDefinitionV1 } from '../situation-definition'
import type { SituationalGoldenCase } from '../situation-scoring'

const assertivenessOptions = [
  { optionKey: 'A', label: '直接指出数据实际支持哪一个，并建议重新确认。' },
  { optionKey: 'B', label: '表示"我好像看到的是另一个结果"，请大家再看一次。' },
  { optionKey: 'C', label: '先不打断，会后私下提醒负责汇报的人。' },
  { optionKey: 'D', label: '不再提出，按大家已经决定的方案继续。' },
] as const

const assertivenessContributions = [
  { optionKey: 'A', contribution: 1.5 },
  { optionKey: 'B', contribution: 0.5 },
  { optionKey: 'C', contribution: -0.5 },
  { optionKey: 'D', contribution: -1.5 },
] as const

export const SJT_ASSERTIVENESS_GOLDEN_ZH_CN_V1_DEFINITION: SituationDefinitionV1 = {
  schemaVersion: 1,
  respondentType: 'participant_self_report',
  source: {
    title: '情境化人格测评黄金模板：E-Assertiveness（行为倾向通道，文字版 V1）',
    citation: 'eduK12 情境化测评设计组，基于 BFI-2 Assertiveness facet 的自编情境草案。',
    publicationYear: 2026,
  },
  license: {
    status: 'self_authored',
    redistribution: 'restricted',
    note: '自编情境草案；provisional key 仅用于开发期验证，不得作为常模解释依据。',
  },
  sampling: { strategy: 'ALL' },
  scenes: [
    {
      sceneKey: 'AS-01',
      title: '大家都同意了，你要指出错误吗？',
      sortOrder: 0,
      stimulus: {
        type: 'TEXT_V1',
        text: '四人小组正在快速确定汇报方案。你刚看见屏幕上的数据明显支持方案 B，但组员把它误读成了 A。有人看了一眼时间说"差不多了，就这样吧"，其他人点头。组员甲看向你："你也觉得 A 可以吧？"——画面定格。',
      },
      primaryConstruct: 'bfi2.assertiveness',
      secondaryConstructs: ['bfi2.respectfulness'],
      situationFeatures: { duty: 0.8, sociality: 0.5, adversity: 0.5 },
      channels: [{
        channelKey: 'behavior',
        purpose: 'BEHAVIOR_TENDENCY',
        responseType: 'SINGLE_CHOICE',
        scoredConstruct: 'bfi2.assertiveness',
        prompt: '如果是你，下一步最可能怎么做？',
        options: [...assertivenessOptions],
      }],
    },
    {
      sceneKey: 'AS-02',
      title: '会上资深同事用错了数字，你要开口吗？',
      sortOrder: 1,
      stimulus: {
        type: 'TEXT_V1',
        text: '会议室里正在过月度数据。资深同事引用一组数字得出结论，而你手头的报表清楚显示正确数字是另一个。会议即将进入下一项，没有人提出疑问。主持人看向你："这里大家没有异议吧？"——画面定格。',
      },
      primaryConstruct: 'bfi2.assertiveness',
      secondaryConstructs: ['bfi2.respectfulness'],
      situationFeatures: { duty: 0.8, sociality: 0.6, adversity: 0.6 },
      channels: [{
        channelKey: 'behavior',
        purpose: 'BEHAVIOR_TENDENCY',
        responseType: 'SINGLE_CHOICE',
        scoredConstruct: 'bfi2.assertiveness',
        prompt: '如果是你，此刻最可能怎么做？',
        options: [...assertivenessOptions],
      }],
    },
  ],
  scoring: {
    scoringVersion: 'sjt-provisional-v1',
    choiceScores: ['AS-01', 'AS-02'].flatMap((sceneKey) => (
      assertivenessContributions.map(({ optionKey, contribution }) => ({
        sceneKey,
        channelKey: 'behavior' as const,
        optionKey,
        contribution,
      }))
    )),
    publishedMetrics: [{
      key: 'bfi2.assertiveness.behavior',
      label: '果断性 × 行为倾向（provisional）',
      construct: 'bfi2.assertiveness',
      channelKey: 'behavior',
      direction: 'higher_is_more',
      role: 'primary',
      displayPrecision: 2,
    }],
  },
  report: {
    reportVersion: 'sjt-report-v1',
    primaryMetricKeys: ['bfi2.assertiveness.behavior'],
    metricOrder: ['bfi2.assertiveness.behavior'],
    interpretations: [{
      metricKey: 'bfi2.assertiveness.behavior',
      headline: '果断性 × 行为倾向（情境化，provisional）',
      summary: '反映在"群体共识 + 时间压力 + 是否公开表达异议"的标准化情境中，公开表达异议的行为倾向梯度。分数为开发期 provisional 编码，不构成人格常模结论。',
      guidance: [
        { category: 'reflection', text: '可回顾自己在需要公开表达不同意见的情境中，通常选择哪种强度的表达方式。' },
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

const responsesFor = (optionKey: string, sceneKeys: string[]): Array<{ sceneKey: string; channelKey: 'behavior'; responseValue: string }> => (
  sceneKeys.map((sceneKey) => ({ sceneKey, channelKey: 'behavior' as const, responseValue: optionKey }))
)

export const SJT_ASSERTIVENESS_GOLDEN_ZH_CN_V1_GOLDEN_CASES: SituationalGoldenCase[] = [
  {
    name: 'all-strongest',
    responses: responsesFor('A', ['AS-01', 'AS-02']),
    expected: { quality: 'interpretable', metrics: { 'bfi2.assertiveness.behavior': 1.5 }, metricKeys: ['bfi2.assertiveness.behavior'] },
  },
  {
    name: 'all-weakest',
    responses: responsesFor('D', ['AS-01', 'AS-02']),
    expected: { quality: 'interpretable', metrics: { 'bfi2.assertiveness.behavior': -1.5 }, metricKeys: ['bfi2.assertiveness.behavior'] },
  },
  {
    name: 'mixed-gradient',
    responses: [
      { sceneKey: 'AS-01', channelKey: 'behavior', responseValue: 'A' },
      { sceneKey: 'AS-02', channelKey: 'behavior', responseValue: 'D' },
    ],
    expected: { quality: 'interpretable', metrics: { 'bfi2.assertiveness.behavior': 0 }, metricKeys: ['bfi2.assertiveness.behavior'] },
  },
  {
    name: 'missing-second-scene',
    responses: responsesFor('A', ['AS-01']),
    expected: { quality: 'invalid', metrics: { 'bfi2.assertiveness.behavior': null }, metricKeys: ['bfi2.assertiveness.behavior'] },
  },
]

export const SJT_ASSERTIVENESS_GOLDEN_ZH_CN_V1_PACKAGE = {
  key: 'sjt-assertiveness-golden',
  instrumentVersion: '1.0.0',
  releaseStatus: 'DRAFT' as const,
  definition: SJT_ASSERTIVENESS_GOLDEN_ZH_CN_V1_DEFINITION,
  goldenCases: SJT_ASSERTIVENESS_GOLDEN_ZH_CN_V1_GOLDEN_CASES,
}
