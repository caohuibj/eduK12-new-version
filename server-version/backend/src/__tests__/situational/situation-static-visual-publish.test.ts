import { describe, expect, it } from 'vitest'
import { validateSituationDefinition, type SituationDefinitionV1 } from '../../modules/situational/situation-definition'
import { SJT_ASSERTIVENESS_GOLDEN_ZH_CN_V1_DEFINITION } from '../../modules/situational/packages/sjt-assertiveness-golden-zh-cn-v1'

const clone = (): SituationDefinitionV1 => (
  JSON.parse(JSON.stringify(SJT_ASSERTIVENESS_GOLDEN_ZH_CN_V1_DEFINITION)) as SituationDefinitionV1
)

const imageAsset = {
  assetId: 'asset-image-1',
  contentHash: 'a'.repeat(64),
  mimeType: 'image/png' as const,
}

describe('Situational static visual publication composition', () => {
  it('requires published IMAGE/COMIC scenes to preserve a non-blank text stimulus', () => {
    const valid = clone()
    valid.scenes[0]!.stimulus = {
      type: 'IMAGE',
      text: '先阅读这段情境说明，再结合图片作答。',
      asset: imageAsset,
      altText: '小组正在查看投影内容',
    }
    expect(validateSituationDefinition(valid, { forPublish: true }).issues.filter((issue) => issue.severity === 'error')).toEqual([])

    const missingText = clone()
    missingText.scenes[0]!.stimulus = {
      type: 'IMAGE',
      asset: imageAsset,
      altText: '小组正在查看投影内容',
    }
    expect(validateSituationDefinition(missingText, { forPublish: true }).issues)
      .toContainEqual(expect.objectContaining({ path: 'scenes.0.stimulus.text', severity: 'error' }))

    const comicMissingText = clone()
    comicMissingText.scenes[0]!.stimulus = {
      type: 'COMIC',
      panels: [{ assetRef: imageAsset, altText: '漫画第一格' }],
    }
    expect(validateSituationDefinition(comicMissingText, { forPublish: true }).issues)
      .toContainEqual(expect.objectContaining({ path: 'scenes.0.stimulus.text', severity: 'error' }))
  })
})
