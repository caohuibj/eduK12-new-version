import { describe, expect, it } from 'vitest'
import { assessmentVideoPresentationSchema } from '../../modules/assessment-media/assessment-video'

describe('MEDIA-6 architecture boundaries', () => {
  it('keeps playback metadata outside the scientific response plane', () => {
    const parsed = assessmentVideoPresentationSchema.parse({
      schemaVersion: 1,
      video: { assetId: 'video-1', contentHash: 'a'.repeat(64), mimeType: 'video/webm' },
      transcript: { language: 'zh-CN', text: '示例文字稿' },
      title: '示例视频',
    })
    expect(parsed).not.toHaveProperty('response')
    expect(parsed).not.toHaveProperty('score')
    expect(parsed).not.toHaveProperty('watchProgress')
    expect(parsed).not.toHaveProperty('requiredWatchSeconds')
  })
})
