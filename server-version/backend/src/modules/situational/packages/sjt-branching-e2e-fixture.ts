/**
 * SIT-V2-E browser-only fixture. It is opt-in through
 * SITUATIONAL_BRANCHING_E2E_FIXTURE and is never part of the normal catalog.
 *
 * One frozen DAG deliberately combines the product surfaces that the final
 * branching acceptance gate must exercise: IMAGE entry decision, TEXT
 * diagnostic follow-up, COMIC nested decision, a second-round scored scene,
 * optional diagnostic evidence, early terminals, and deterministic routing.
 */
import type { SituationDefinitionV2 } from '../situation-branching'
import type { SituationalGoldenCase } from '../situation-scoring'
import { SJT_ASSERTIVENESS_GOLDEN_ZH_CN_V1_DEFINITION } from './sjt-assertiveness-golden-zh-cn-v1'
import { SITUATIONAL_STATIC_VISUAL_E2E_ASSETS } from './sjt-static-visual-e2e-fixture'

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T
const source = clone(SJT_ASSERTIVENESS_GOLDEN_ZH_CN_V1_DEFINITION)

const entry = clone(source.scenes[0]!)
entry.sceneKey = 'BR-01'
entry.sortOrder = 0
entry.title = '第一轮：发现数据被误读，你会怎么做？'
entry.stimulus = {
  type: 'IMAGE',
  text: entry.stimulus.text,
  asset: SITUATIONAL_STATIC_VISUAL_E2E_ASSETS.image,
  altText: '一组成员正在核对投影数据。',
  caption: 'Branching IMAGE entry fixture',
}

const diagnostic = clone(source.scenes[1]!)
diagnostic.sceneKey = 'BR-02'
diagnostic.sortOrder = 1
diagnostic.title = '第一轮追问：你会怎样公开表达？'
diagnostic.stimulus = {
  type: 'TEXT_V1',
  text: '你决定继续参与讨论。主持人停下来等你说明。请选择你最可能采取的表达方式，并可选补充你对这一判断的把握程度。',
}
diagnostic.channels.push({
  channelKey: 'confidence',
  purpose: 'CONFIDENCE',
  responseType: 'CONTINUOUS',
  scoredConstruct: 'bfi2.assertiveness',
  prompt: '如果愿意补充，你对刚才判断有多大把握？',
  range: { min: 0, max: 100 },
  scoringDirection: 'POSITIVE',
})

const nested = clone(source.scenes[0]!)
nested.sceneKey = 'BR-03'
nested.sortOrder = 2
nested.title = '第一轮继续：对方仍坚持原判断，你会继续吗？'
nested.stimulus = {
  type: 'COMIC',
  text: '你已经表达了不同意见，但另一位成员仍坚持原判断。请根据新的情境继续决策。',
  panels: [
    {
      assetRef: SITUATIONAL_STATIC_VISUAL_E2E_ASSETS.comicPanelOne,
      altText: '漫画第一格：成员发现数据需要复核。',
      caption: 'Nested decision panel 1',
    },
    {
      assetRef: SITUATIONAL_STATIC_VISUAL_E2E_ASSETS.comicPanelTwo,
      altText: '漫画第二格：成员提出重新确认。',
      caption: 'Nested decision panel 2',
    },
  ],
}

const roundTwo = clone(source.scenes[1]!)
roundTwo.sceneKey = 'BR-04'
roundTwo.sortOrder = 3
roundTwo.title = '第二轮：新的会议情境'
roundTwo.stimulus = {
  type: 'TEXT_V1',
  text: '第二轮出现了新的公开表达机会。请根据这个新情境选择你最可能采取的行动。',
}

const remapChoiceScores = (sourceSceneKey: string, targetSceneKey: string) => (
  source.scoring.choiceScores
    .filter((entry) => entry.sceneKey === sourceSceneKey)
    .map((entry) => ({ ...entry, sceneKey: targetSceneKey }))
)

const entryDecision = entry.channels[0]
const nestedDecision = nested.channels[0]
if (!entryDecision || entryDecision.responseType !== 'SINGLE_CHOICE') throw new Error('branching fixture requires SINGLE_CHOICE entry')
if (!nestedDecision || nestedDecision.responseType !== 'SINGLE_CHOICE') throw new Error('branching fixture requires SINGLE_CHOICE nested decision')

export const SJT_BRANCHING_E2E_DEFINITION: SituationDefinitionV2 = {
  ...source,
  schemaVersion: 2,
  source: {
    ...source.source,
    title: 'SIT-V2-E branching browser acceptance fixture',
  },
  sampling: { strategy: 'BRANCH_REACHABLE' },
  scenes: [entry, diagnostic, nested, roundTwo],
  scoring: {
    ...source.scoring,
    choiceScores: [
      ...remapChoiceScores('AS-01', 'BR-02'),
      ...remapChoiceScores('AS-02', 'BR-04'),
    ],
  },
  flow: {
    strategy: 'BRANCHING_DAG_V1',
    entryNodeKey: 'node-entry',
    nodes: [
      {
        nodeType: 'SCENE',
        nodeKey: 'node-entry',
        sceneKey: 'BR-01',
        motherSceneKey: 'branching-browser-mother',
        roundKey: 'round-1',
        stepKey: 'decision-1',
        interactionRole: 'DECISION',
        channelPolicies: [{ channelKey: 'behavior', measurementRole: 'ROUTING_ONLY', required: true }],
        transition: {
          type: 'DECISION',
          channelKey: 'behavior',
          branches: entryDecision.options.map((option) => ({
            optionKey: option.optionKey,
            nextNodeKey: option.optionKey === 'B'
              ? 'terminal-early'
              : option.optionKey === 'C'
                ? 'node-nested'
                : 'node-diagnostic',
          })),
        },
      },
      {
        nodeType: 'SCENE',
        nodeKey: 'node-diagnostic',
        sceneKey: 'BR-02',
        motherSceneKey: 'branching-browser-mother',
        roundKey: 'round-1',
        stepKey: 'diagnostic-1',
        interactionRole: 'DIAGNOSTIC',
        channelPolicies: [
          { channelKey: 'behavior', measurementRole: 'SCORED', required: true },
          { channelKey: 'confidence', measurementRole: 'ROUTING_ONLY', required: false },
        ],
        transition: { type: 'NEXT', nextNodeKey: 'node-nested' },
      },
      {
        nodeType: 'SCENE',
        nodeKey: 'node-nested',
        sceneKey: 'BR-03',
        motherSceneKey: 'branching-browser-mother',
        roundKey: 'round-1',
        stepKey: 'decision-2',
        interactionRole: 'DECISION',
        channelPolicies: [{ channelKey: 'behavior', measurementRole: 'ROUTING_ONLY', required: true }],
        transition: {
          type: 'DECISION',
          channelKey: 'behavior',
          branches: nestedDecision.options.map((option) => ({
            optionKey: option.optionKey,
            nextNodeKey: option.optionKey === 'C' || option.optionKey === 'D'
              ? 'terminal-nested'
              : 'node-round-2',
          })),
        },
      },
      {
        nodeType: 'SCENE',
        nodeKey: 'node-round-2',
        sceneKey: 'BR-04',
        motherSceneKey: 'branching-browser-mother',
        roundKey: 'round-2',
        stepKey: 'diagnostic-1',
        interactionRole: 'DIAGNOSTIC',
        channelPolicies: [{ channelKey: 'behavior', measurementRole: 'SCORED', required: true }],
        transition: { type: 'NEXT', nextNodeKey: 'terminal-complete' },
      },
      { nodeType: 'TERMINAL', nodeKey: 'terminal-early' },
      { nodeType: 'TERMINAL', nodeKey: 'terminal-nested' },
      { nodeType: 'TERMINAL', nodeKey: 'terminal-complete' },
    ],
  },
}

export const SJT_BRANCHING_E2E_GOLDEN_CASES: SituationalGoldenCase[] = [
  {
    name: 'long-path-strongest',
    responses: [
      { sceneKey: 'BR-01', channelKey: 'behavior', responseValue: 'A' },
      { sceneKey: 'BR-02', channelKey: 'behavior', responseValue: 'A' },
      { sceneKey: 'BR-02', channelKey: 'confidence', responseValue: 80 },
      { sceneKey: 'BR-03', channelKey: 'behavior', responseValue: 'A' },
      { sceneKey: 'BR-04', channelKey: 'behavior', responseValue: 'A' },
    ],
    expected: {
      quality: 'interpretable',
      metrics: { 'bfi2.assertiveness.behavior': 1.5 },
      metricKeys: ['bfi2.assertiveness.behavior'],
    },
  },
  {
    name: 'direct-nested-path',
    responses: [
      { sceneKey: 'BR-01', channelKey: 'behavior', responseValue: 'C' },
      { sceneKey: 'BR-03', channelKey: 'behavior', responseValue: 'A' },
      { sceneKey: 'BR-04', channelKey: 'behavior', responseValue: 'D' },
    ],
    expected: {
      quality: 'interpretable',
      metrics: { 'bfi2.assertiveness.behavior': -1.5 },
      metricKeys: ['bfi2.assertiveness.behavior'],
    },
  },
]

export const SJT_BRANCHING_E2E_PACKAGE = {
  key: 'sjt-branching-e2e-fixture',
  instrumentVersion: '2.0.0',
  releaseStatus: 'PUBLISHED' as const,
  scienceMaturity: 'PILOT' as const,
  definition: SJT_BRANCHING_E2E_DEFINITION,
  goldenCases: SJT_BRANCHING_E2E_GOLDEN_CASES,
}
