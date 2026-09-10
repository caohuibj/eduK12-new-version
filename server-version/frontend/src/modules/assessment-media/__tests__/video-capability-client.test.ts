import { afterEach, describe, expect, it, vi } from 'vitest'
import { requestAssessmentVideoCapabilities } from '../video-capability-client'

const jsonResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json' },
})

describe('requestAssessmentVideoCapabilities', () => {
  afterEach(() => vi.restoreAllMocks())

  it('returns the MEDIA-4 capability sources from the standard API envelope', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({
      code: 0,
      message: 'ok',
      data: {
        videoUrl: '/api/assets/assessment-media/content?cap=video',
        posterUrl: '/api/assets/assessment-media/content?cap=poster',
        captions: [{
          assetId: 'caption-1',
          src: '/api/assets/assessment-media/content?cap=caption',
          kind: 'captions',
          srcLang: 'zh-CN',
          label: '中文',
        }],
      },
    }))

    await expect(requestAssessmentVideoCapabilities('/api/test/video-capability')).resolves.toMatchObject({
      videoUrl: '/api/assets/assessment-media/content?cap=video',
      posterUrl: '/api/assets/assessment-media/content?cap=poster',
    })
  })

  it('fails closed for an invalid or unsuccessful capability envelope', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(jsonResponse({ code: 404, message: 'not found', data: null }, 404))
    await expect(requestAssessmentVideoCapabilities('/api/test/missing')).rejects.toThrow('not found')

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(jsonResponse({ code: 0, message: 'ok', data: { posterUrl: '/poster' } }))
    await expect(requestAssessmentVideoCapabilities('/api/test/invalid')).rejects.toThrow('视频授权响应无效')
  })
})
