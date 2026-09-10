import { describe, expect, it } from 'vitest'
import { hashScaleDefinition, scaleDefinitionSchema, type ScaleDefinitionV2 } from '../../modules/scale/scale-definition'
import { scoreScale } from '../../modules/scale/scale-scoring'

const baseDefinition = (): ScaleDefinitionV2 => scaleDefinitionSchema.parse({
  schemaVersion: 2,
  respondentType: 'participant_self_report',
  source: { title: 'MEDIA-6 test scale' },
  license: { status: 'self_authored', redistribution: 'allowed' },
  display: { randomizeItems: false },
  responseSets: [{
    key: 'default',
    options: [
      { value: 'A', label: 'A', score: 1 },
      { value: 'B', label: 'B', score: 2 },
    ],
  }],
  items: [{
    itemCode: 'S1',
    content: '示例题目',
    type: 'single',
    required: true,
    sortOrder: 0,
    responseSetKey: 'default',
    randomizeOptions: false,
  }],
  scoring: {
    scoringVersion: 'media-6-score-v1',
    itemRules: [{ itemCode: 'S1', transform: { type: 'identity' } }],
    defaultMissingPolicy: { type: 'complete_required' },
    scores: [{
      key: 'total',
      type: 'total',
      label: '总分',
      direction: 'higher_is_more',
      canonical: true,
      displayPrecision: 0,
      source: { type: 'items', items: [{ itemCode: 'S1', weight: 1 }], aggregation: 'sum' },
    }],
  },
  report: {
    reportVersion: 'media-6-report-v1',
    primaryScoreKeys: ['total'],
    scoreOrder: ['total'],
    interpretations: [{
      scoreKey: 'total',
      headline: '示例',
      source: { type: 'score_only' },
      summary: '示例解释',
      bands: [],
      guidance: [],
    }],
    limitations: [],
    disclaimer: '仅用于测试。',
  },
  referencePolicy: { type: 'none' },
})

const withVideo = (definition: ScaleDefinitionV2, assetId: string): ScaleDefinitionV2 => scaleDefinitionSchema.parse({
  ...definition,
  items: definition.items.map((item) => item.itemCode === 'S1'
    ? {
        ...item,
        video: {
          schemaVersion: 1,
          video: { assetId, contentHash: 'a'.repeat(64), mimeType: 'video/webm' },
          poster: { assetId: `${assetId}-poster`, contentHash: 'b'.repeat(64), mimeType: 'image/png' },
          captions: [{
            asset: { assetId: `${assetId}-vtt`, contentHash: 'c'.repeat(64), mimeType: 'text/vtt' },
            kind: 'captions',
            srcLang: 'zh-CN',
            label: '中文',
            default: true,
          }],
          transcript: { language: 'zh-CN', text: '示例文字稿' },
          title: '示例视频',
        },
      }
    : item),
})

describe('MEDIA-6 Scale definition integration', () => {
  it('keeps item video in the parsed scientific definition and identity hash', () => {
    const plain = baseDefinition()
    const video = withVideo(plain, 'scale-video-1')
    expect(video.items[0].video?.video.assetId).toBe('scale-video-1')
    expect(hashScaleDefinition(video)).not.toBe(hashScaleDefinition(plain))
  })

  it('does not change scoringVersion or score semantics when only presentation changes', () => {
    const plain = baseDefinition()
    const video = withVideo(plain, 'scale-video-2')
    expect(video.scoring.scoringVersion).toBe(plain.scoring.scoringVersion)
    expect(scoreScale(video, { S1: 'B' })).toEqual(scoreScale(plain, { S1: 'B' }))
  })

  it('fails closed for an invalid declared Scale video identity', () => {
    const plain = baseDefinition()
    expect(() => scaleDefinitionSchema.parse({
      ...plain,
      items: [{
        ...plain.items[0],
        video: {
          schemaVersion: 1,
          video: { assetId: 'bad-video', contentHash: 'short', mimeType: 'video/webm' },
        },
      }],
    })).toThrow()
  })
})
