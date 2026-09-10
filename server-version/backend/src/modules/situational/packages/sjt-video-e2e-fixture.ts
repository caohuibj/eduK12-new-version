/**
 * MEDIA-5 browser-only Situational VIDEO fixture.
 *
 * The asset hashes are injected by the isolated browser seed before the backend
 * starts. Normal environments never opt this package into the registry.
 */
import type { SituationDefinitionV2 } from '../situation-branching'
import type { SituationalGoldenCase } from '../situation-scoring'
import { SJT_ASSERTIVENESS_GOLDEN_ZH_CN_V1_DEFINITION } from './sjt-assertiveness-golden-zh-cn-v1'

export const SITUATIONAL_VIDEO_E2E = {
  key: 'sjt-video-e2e-fixture',
  version: '2.0.0',
  videoAssetId: 'situational-video-e2e-video',
  posterAssetId: 'situational-video-e2e-poster',
  captionAssetId: 'situational-video-e2e-caption',
} as const

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T
const source = clone(SJT_ASSERTIVENESS_GOLDEN_ZH_CN_V1_DEFINITION)

const fixtureHash = (name: string): string => {
  const value = process.env[name] || '0'.repeat(64)
  if (!/^[a-f0-9]{64}$/u.test(value)) throw new Error(`${name} must be a sha256 hex digest`)
  return value
}

const entry = clone(source.scenes[0]!)
entry.sceneKey = 'VIDEO-01'
entry.sortOrder = 0
entry.title = '视频情境：发现数据被误读，你会怎么做？'
entry.stimulus = {
  type: 'VIDEO',
  text: '先观看视频中的小组讨论，再选择你最可能采取的行动。',
  presentation: {
    schemaVersion: 1,
    video: {
      assetId: SITUATIONAL_VIDEO_E2E.videoAssetId,
      contentHash: fixtureHash('SITUATIONAL_VIDEO_E2E_VIDEO_HASH'),
      mimeType: 'video/webm',
    },
    poster: {
      assetId: SITUATIONAL_VIDEO_E2E.posterAssetId,
      contentHash: fixtureHash('SITUATIONAL_VIDEO_E2E_POSTER_HASH'),
      mimeType: 'image/png',
    },
    captions: [{
      asset: {
        assetId: SITUATIONAL_VIDEO_E2E.captionAssetId,
        contentHash: fixtureHash('SITUATIONAL_VIDEO_E2E_CAPTION_HASH'),
        mimeType: 'text/vtt',
      },
      kind: 'captions',
      srcLang: 'zh-CN',
      label: '中文字幕',
      default: true,
    }],
    transcript: {
      language: 'zh-CN',
      text: 'MEDIA-5 浏览器验收文字稿：小组正在核对一组被误读的数据。',
    },
    title: 'MEDIA-5 Situational Video Fixture',
    description: '视频只负责呈现；作答决定分支。',
  },
}

const followUp = clone(source.scenes[1]!)
followUp.sceneKey = 'VIDEO-02'
followUp.sortOrder = 1
followUp.title = '后续情境：你决定继续表达'
followUp.stimulus = {
  type: 'TEXT_V1',
  text: '你已经决定继续参与讨论。现在请选择你最可能采用的表达方式。',
}

const entryDecision = entry.channels[0]
if (!entryDecision || entryDecision.responseType !== 'SINGLE_CHOICE') {
  throw new Error('MEDIA-5 fixture requires a SINGLE_CHOICE entry channel')
}

const remappedFollowUpScores = source.scoring.choiceScores
  .filter((score) => score.sceneKey === 'AS-02')
  .map((score) => ({ ...score, sceneKey: 'VIDEO-02' }))

export const SJT_VIDEO_E2E_DEFINITION: SituationDefinitionV2 = {
  ...source,
  schemaVersion: 2,
  source: {
    ...source.source,
    title: 'MEDIA-5 Situational VIDEO browser acceptance fixture',
  },
  sampling: { strategy: 'BRANCH_REACHABLE' },
  scenes: [entry, followUp],
  scoring: {
    ...source.scoring,
    choiceScores: remappedFollowUpScores,
  },
  report: {
    ...source.report,
    interpretations: source.report.interpretations.map((interpretation, index) => (
      index === 0
        ? { ...interpretation, headline: 'MEDIA-5 Situational Video Fixture' }
        : interpretation
    )),
  },
  flow: {
    strategy: 'BRANCHING_DAG_V1',
    entryNodeKey: 'node-video',
    nodes: [
      {
        nodeType: 'SCENE',
        nodeKey: 'node-video',
        sceneKey: 'VIDEO-01',
        motherSceneKey: 'media-5-video-mother',
        roundKey: 'round-1',
        stepKey: 'video-decision',
        interactionRole: 'DECISION',
        channelPolicies: [{ channelKey: 'behavior', measurementRole: 'ROUTING_ONLY', required: true }],
        transition: {
          type: 'DECISION',
          channelKey: 'behavior',
          branches: entryDecision.options.map((option) => ({
            optionKey: option.optionKey,
            nextNodeKey: option.optionKey === 'A' ? 'node-follow-up' : 'terminal-early',
          })),
        },
      },
      {
        nodeType: 'SCENE',
        nodeKey: 'node-follow-up',
        sceneKey: 'VIDEO-02',
        motherSceneKey: 'media-5-video-mother',
        roundKey: 'round-1',
        stepKey: 'scored-follow-up',
        interactionRole: 'DIAGNOSTIC',
        channelPolicies: [{ channelKey: 'behavior', measurementRole: 'SCORED', required: true }],
        transition: { type: 'NEXT', nextNodeKey: 'terminal-complete' },
      },
      { nodeType: 'TERMINAL', nodeKey: 'terminal-early' },
      { nodeType: 'TERMINAL', nodeKey: 'terminal-complete' },
    ],
  },
}

export const SJT_VIDEO_E2E_GOLDEN_CASES: SituationalGoldenCase[] = [{
  name: 'video-answer-drives-long-path',
  responses: [
    { sceneKey: 'VIDEO-01', channelKey: 'behavior', responseValue: 'A' },
    { sceneKey: 'VIDEO-02', channelKey: 'behavior', responseValue: 'A' },
  ],
  expected: {
    quality: 'interpretable',
    metrics: { 'bfi2.assertiveness.behavior': 1.5 },
    metricKeys: ['bfi2.assertiveness.behavior'],
  },
}]

export const SJT_VIDEO_E2E_PACKAGE = {
  key: SITUATIONAL_VIDEO_E2E.key,
  instrumentVersion: SITUATIONAL_VIDEO_E2E.version,
  releaseStatus: 'PUBLISHED' as const,
  scienceMaturity: 'PILOT' as const,
  definition: SJT_VIDEO_E2E_DEFINITION,
  goldenCases: SJT_VIDEO_E2E_GOLDEN_CASES,
}
