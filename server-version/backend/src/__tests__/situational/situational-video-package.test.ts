import { describe, expect, it } from 'vitest'
import { hashSituationRuntimeDefinition } from '../../modules/situational/situation-runtime-definition'
import { validateSituationPackage } from '../../modules/situational/situation-package.registry'
import { SJT_VIDEO_E2E_PACKAGE } from '../../modules/situational/packages/sjt-video-e2e-fixture'

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

describe('MEDIA-5 Situational VIDEO package boundary', () => {
  it('passes the existing V2 publication/golden gate without new scoring semantics', () => {
    const validation = validateSituationPackage(SJT_VIDEO_E2E_PACKAGE)
    expect(validation.valid).toBe(true)
    expect(validation.issues.filter((issue) => issue.severity === 'error')).toEqual([])
    expect(validation.issues.filter((issue) => issue.severity === 'warning').every((issue) => issue.path === 'license')).toBe(true)

    const videoNode = SJT_VIDEO_E2E_PACKAGE.definition.flow.nodes.find((node) => node.nodeKey === 'node-video')
    expect(videoNode).toMatchObject({
      nodeType: 'SCENE',
      sceneKey: 'VIDEO-01',
      interactionRole: 'DECISION',
      transition: { type: 'DECISION', channelKey: 'behavior' },
    })
    expect(JSON.stringify(videoNode)).not.toMatch(/play|pause|ended|currentTime|duration|buffer/i)
  })

  it('binds video presentation identity into the frozen definition hash only', () => {
    const changed = clone(SJT_VIDEO_E2E_PACKAGE.definition)
    const firstScene = changed.scenes.find((scene) => scene.sceneKey === 'VIDEO-01')
    expect(firstScene?.stimulus.type).toBe('VIDEO')
    if (!firstScene || firstScene.stimulus.type !== 'VIDEO') throw new Error('VIDEO fixture scene missing')

    const originalHash = hashSituationRuntimeDefinition(SJT_VIDEO_E2E_PACKAGE.definition)
    firstScene.stimulus.presentation.video.contentHash = 'f'.repeat(64)
    const changedHash = hashSituationRuntimeDefinition(changed)

    expect(changedHash).not.toBe(originalHash)
    expect(changed.scoring).toEqual(SJT_VIDEO_E2E_PACKAGE.definition.scoring)
    expect(changed.report).toEqual(SJT_VIDEO_E2E_PACKAGE.definition.report)
    expect(changed.flow).toEqual(SJT_VIDEO_E2E_PACKAGE.definition.flow)
  })
})
