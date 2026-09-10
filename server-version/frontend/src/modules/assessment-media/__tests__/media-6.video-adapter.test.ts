import { describe, expect, it } from 'vitest'
import { formOptionVideoPresentations, scaleItemVideoPresentation } from '../video-adapter'

const presentation = (assetId = 'video-1') => ({
  schemaVersion: 1 as const,
  video: { assetId, contentHash: 'a'.repeat(64), mimeType: 'video/webm' as const },
  poster: { assetId: `${assetId}-poster`, contentHash: 'b'.repeat(64), mimeType: 'image/png' as const },
  captions: [{
    asset: { assetId: `${assetId}-vtt`, contentHash: 'c'.repeat(64), mimeType: 'text/vtt' as const },
    kind: 'captions' as const,
    srcLang: 'zh-CN',
    label: '中文',
    default: true,
  }],
})

describe('MEDIA-6 video projections', () => {
  it('projects a Scale item video without changing response data', () => {
    const item = { itemCode: 'S1', content: '题目', video: presentation() }
    expect(scaleItemVideoPresentation(item)).toEqual(presentation())
    expect((item as any).value).toBeUndefined()
  })

  it('keeps Form option association explicit', () => {
    const options = [
      { value: 'A', label: '选项 A', video: presentation('video-a') },
      { value: 'B', label: '选项 B' },
    ]
    expect(formOptionVideoPresentations(options)).toEqual([{
      optionIndex: 0,
      optionLabel: '选项 A',
      presentation: presentation('video-a'),
    }])
  })

  it('fails closed on malformed immutable identities', () => {
    expect(scaleItemVideoPresentation({ video: { ...presentation(), video: { assetId: 'bad', contentHash: 'short', mimeType: 'video/webm' } } })).toBeUndefined()
    expect(formOptionVideoPresentations([{ label: 'A', video: { ...presentation(), captions: [{ asset: { assetId: 'x', contentHash: 'c'.repeat(64), mimeType: 'text/plain' }, kind: 'captions', srcLang: 'zh-CN', label: '中文' }] } }])).toEqual([])
  })
})
