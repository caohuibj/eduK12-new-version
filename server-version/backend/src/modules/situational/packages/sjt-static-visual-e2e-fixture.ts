/**
 * PR-E browser-only fixture. It is opt-in through
 * SITUATIONAL_STATIC_VISUAL_FIXTURE and is never part of the normal catalog.
 * The response/scoring plane is copied from the published assertiveness
 * golden package; only the presentation stimulus changes.
 */
import type { SituationDefinitionV1 } from '../situation-definition'
import type { SituationalGoldenCase } from '../situation-scoring'
import { SJT_ASSERTIVENESS_GOLDEN_ZH_CN_V1_DEFINITION, SJT_ASSERTIVENESS_GOLDEN_ZH_CN_V1_GOLDEN_CASES } from './sjt-assertiveness-golden-zh-cn-v1'

const FIXTURE_CONTENT_HASH = '431ced6916a2a21a156e38701afe55bbd7f88969fbbfc56d7fe099d47f265460'

export const SITUATIONAL_STATIC_VISUAL_E2E_ASSETS = {
  image: { assetId: 'situational-static-visual-image', contentHash: FIXTURE_CONTENT_HASH, mimeType: 'image/png' as const },
  comicPanelOne: { assetId: 'situational-static-visual-panel-1', contentHash: FIXTURE_CONTENT_HASH, mimeType: 'image/png' as const },
  comicPanelTwo: { assetId: 'situational-static-visual-panel-2', contentHash: FIXTURE_CONTENT_HASH, mimeType: 'image/png' as const },
}

const cloneDefinition = (definition: SituationDefinitionV1): SituationDefinitionV1 => (
  JSON.parse(JSON.stringify(definition)) as SituationDefinitionV1
)

const baseDefinition = cloneDefinition(SJT_ASSERTIVENESS_GOLDEN_ZH_CN_V1_DEFINITION)

export const SJT_STATIC_VISUAL_E2E_DEFINITION: SituationDefinitionV1 = {
  ...baseDefinition,
  source: {
    ...baseDefinition.source,
    title: 'PR-E static visual browser fixture',
  },
  scenes: baseDefinition.scenes.map((scene, index) => ({
    ...scene,
    stimulus: index === 0
      ? {
          type: 'IMAGE' as const,
          asset: SITUATIONAL_STATIC_VISUAL_E2E_ASSETS.image,
          altText: '一组成员正在核对投影数据。',
          caption: '静态 IMAGE fixture',
        }
      : {
          type: 'COMIC' as const,
          panels: [
            {
              assetRef: SITUATIONAL_STATIC_VISUAL_E2E_ASSETS.comicPanelOne,
              altText: '漫画第一格：成员发现数据需要复核。',
              caption: 'Panel 1',
            },
            {
              assetRef: SITUATIONAL_STATIC_VISUAL_E2E_ASSETS.comicPanelTwo,
              altText: '漫画第二格：成员提出重新确认。',
              caption: 'Panel 2',
            },
          ],
        },
  })),
}

export const SJT_STATIC_VISUAL_E2E_GOLDEN_CASES: SituationalGoldenCase[] = SJT_ASSERTIVENESS_GOLDEN_ZH_CN_V1_GOLDEN_CASES

export const SJT_STATIC_VISUAL_E2E_PACKAGE = {
  key: 'sjt-static-visual-e2e-fixture',
  instrumentVersion: '1.0.0',
  releaseStatus: 'PUBLISHED' as const,
  scienceMaturity: 'PILOT' as const,
  definition: SJT_STATIC_VISUAL_E2E_DEFINITION,
  goldenCases: SJT_STATIC_VISUAL_E2E_GOLDEN_CASES,
}
