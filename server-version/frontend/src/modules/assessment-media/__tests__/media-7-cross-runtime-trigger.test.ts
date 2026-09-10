import { describe, expect, it } from 'vitest'
import { formOptionVideoPresentations, scaleItemVideoPresentation } from '../video-adapter'

const presentation = {
  schemaVersion: 1 as const,
  video: { assetId: 'video-1', contentHash: '1'.repeat(64), mimeType: 'video/webm' as const },
  poster: { assetId: 'poster-1', contentHash: '2'.repeat(64), mimeType: 'image/webp' as const },
  captions: [{
    asset: { assetId: 'caption-1', contentHash: '3'.repeat(64), mimeType: 'text/vtt' as const },
    kind: 'captions' as const,
    srcLang: 'zh-CN',
    label: '中文字幕',
    default: true,
  }],
}

describe('MEDIA-7 final cross-runtime Scale/Form marker', () => {
  it('keeps the same MEDIA-4 video presentation contract across Scale and Form adapters', () => {
    expect(scaleItemVideoPresentation({ video: presentation })).toEqual(presentation)
    expect(formOptionVideoPresentations([{ label: 'A', video: presentation }])).toEqual([{
      optionIndex: 0,
      optionLabel: 'A',
      presentation,
    }])
    expect(formOptionVideoPresentations([])).toEqual([])
  })
})
