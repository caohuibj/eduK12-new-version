import { describe, expect, it } from 'vitest'
import { listCognitiveRegistryEntries } from '../../modules/cognitive/cognitive.registry'
import { compileCognitiveRuntime } from '../../modules/assessment-runtime/compiler'
import { buildCognitiveV2TaskDefinition } from '../../modules/cognitive/v2/registry'
import {
  cognitivePresentationItems,
  parseCognitivePresentationDefinition,
} from '../../modules/cognitive/v2/presentation'
import { createSessionConfigSnapshot } from '../../modules/cognitive/v2/session-snapshot'
import { findFrozenCognitiveImageReference } from '../../modules/cognitive/cognitive-image.service'

const IMAGE_A = {
  asset: {
    assetId: 'cognitive-image-a',
    contentHash: 'a'.repeat(64),
    mimeType: 'image/png' as const,
  },
  altText: '说明图片 A',
  caption: '第一张说明图',
}

const IMAGE_B = {
  asset: {
    assetId: 'cognitive-image-b',
    contentHash: 'b'.repeat(64),
    mimeType: 'image/webp' as const,
  },
  altText: '示例图片 B',
}

const PRESENTATION = parseCognitivePresentationDefinition({
  schemaVersion: 1,
  instruction: [IMAGE_A],
  example: [IMAGE_B],
})

const fakeEntry = () => {
  const entry = listCognitiveRegistryEntries().find((candidate) => candidate.testType === 'fake')
  if (!entry) throw new Error('fake cognitive registry entry missing')
  return entry
}

const fakeConfig = {
  trialCount: 3,
  trialDurationMs: 1000,
  allowPractice: false,
  maxRtMs: 60000,
}

describe('MEDIA-3 Cognitive image adapter', () => {
  it('keeps presentation optional so no-image task identity remains backward compatible', () => {
    const definition = buildCognitiveV2TaskDefinition(fakeEntry(), 'DRAFT')
    const snapshot = createSessionConfigSnapshot({
      definition,
      configVersion: '1.0.0',
      config: fakeConfig,
      frozenAt: new Date('2026-09-10T00:00:00.000Z'),
    })

    expect(definition.presentation).toBeUndefined()
    expect(snapshot.presentation).toBeUndefined()
    expect(Object.prototype.hasOwnProperty.call(snapshot, 'presentation')).toBe(false)
  })

  it('carries registry presentation into V2 definition and preserves deterministic slot order', () => {
    const definition = buildCognitiveV2TaskDefinition({
      ...fakeEntry(),
      presentation: PRESENTATION,
    }, 'DRAFT')

    expect(definition.presentation).toEqual(PRESENTATION)
    expect(cognitivePresentationItems(definition.presentation).map((item) => item.asset.assetId))
      .toEqual(['cognitive-image-a', 'cognitive-image-b'])
  })

  it('fails closed when registry presentation violates the shared image contract', () => {
    expect(() => buildCognitiveV2TaskDefinition({
      ...fakeEntry(),
      presentation: {
        schemaVersion: 1,
        instruction: [{
          asset: {
            assetId: 'bad-image',
            contentHash: 'not-a-sha256',
            mimeType: 'image/png',
          },
          altText: '',
        }],
      },
    } as never, 'DRAFT')).toThrow()
  })

  it('binds presentation identity/order into compiled runtime without changing scorer semantics', () => {
    const plainDefinition = buildCognitiveV2TaskDefinition(fakeEntry(), 'DRAFT')
    const imageDefinition = buildCognitiveV2TaskDefinition({
      ...fakeEntry(),
      presentation: PRESENTATION,
    }, 'DRAFT')
    const reorderedDefinition = buildCognitiveV2TaskDefinition({
      ...fakeEntry(),
      presentation: {
        schemaVersion: 1,
        instruction: [IMAGE_B, IMAGE_A],
      },
    }, 'DRAFT')

    const plain = compileCognitiveRuntime({ definition: plainDefinition })
    const image = compileCognitiveRuntime({ definition: imageDefinition })
    const reordered = compileCognitiveRuntime({ definition: reorderedDefinition })

    expect(image.sourceDefinitionHash).not.toBe(plain.sourceDefinitionHash)
    expect(image.compiledRuntimeHash).not.toBe(plain.compiledRuntimeHash)
    expect(reordered.sourceDefinitionHash).not.toBe(image.sourceDefinitionHash)
    expect(reordered.compiledRuntimeHash).not.toBe(image.compiledRuntimeHash)

    expect(image.scorerKey).toBe(plain.scorerKey)
    expect(image.scorerVersion).toBe(plain.scorerVersion)
    expect(image.metricDefinitions).toEqual(plain.metricDefinitions)
    expect(image.qualityDefinitions).toEqual(plain.qualityDefinitions)
    expect(image.reportDefinition).toEqual(plain.reportDefinition)
    expect(image.referenceBindingDefinition).toEqual(plain.referenceBindingDefinition)
  })

  it('freezes presentation into the existing session snapshot and resolves only frozen members', () => {
    const definition = buildCognitiveV2TaskDefinition({
      ...fakeEntry(),
      presentation: PRESENTATION,
    }, 'DRAFT')
    const snapshot = createSessionConfigSnapshot({
      definition,
      configVersion: '1.0.0',
      config: fakeConfig,
      frozenAt: new Date('2026-09-10T00:00:00.000Z'),
    })

    expect(snapshot.presentation).toEqual(PRESENTATION)
    expect(findFrozenCognitiveImageReference(snapshot, 'cognitive-image-a')).toEqual(IMAGE_A.asset)
    expect(findFrozenCognitiveImageReference(snapshot, 'cognitive-image-b')).toEqual(IMAGE_B.asset)
    expect(findFrozenCognitiveImageReference(snapshot, 'not-frozen')).toBeUndefined()
  })
})
