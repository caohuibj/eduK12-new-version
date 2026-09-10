import { describe, expect, it } from 'vitest'
import {
  compositeFormSectionVideoPresentations,
  questionnaireFormSectionVideoPresentations,
} from '../../modules/assessment-runtime/form-video.adapter'
import { scaleAssessmentVideoReferences } from '../../modules/scale/scale-video.adapter'

const video = (assetId: string) => ({
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

describe('MEDIA-6 Scale/Form video adapters', () => {
  it('extracts every immutable Scale video reference in presentation order', () => {
    const definition = {
      items: [{ itemCode: 'S1', video: video('scale-video') }],
    } as any
    expect(scaleAssessmentVideoReferences(definition).map((entry) => entry.assetId)).toEqual([
      'scale-video',
      'scale-video-poster',
      'scale-video-vtt',
    ])
  })

  it('extracts Questionnaire option video presentations without altering answer values', () => {
    const definition = {
      items: [{ options: [{ value: 'A', label: 'A', video: video('q-video') }, { value: 'B', label: 'B' }] }],
    }
    expect(questionnaireFormSectionVideoPresentations(definition)).toEqual([video('q-video')])
    expect((definition.items[0].options[0] as any).value).toBe('A')
  })

  it('supports Composite formOptions using the same frozen presentation contract', () => {
    const definition = {
      items: [{ formOptions: [{ value: 'A', label: 'A', video: video('c-video') }] }],
    }
    expect(compositeFormSectionVideoPresentations(definition)).toEqual([video('c-video')])
  })

  it('fails closed when a declared Form video has an invalid capability identity', () => {
    expect(() => questionnaireFormSectionVideoPresentations({
      items: [{ options: [{ value: 'A', label: 'A', video: { ...video('bad'), video: { assetId: 'bad', contentHash: 'short', mimeType: 'video/webm' } } }] }],
    })).toThrow()
  })
})
