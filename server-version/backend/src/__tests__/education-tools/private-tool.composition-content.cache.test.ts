import { beforeEach, describe, expect, it, vi } from 'vitest'
import { canonicalHash } from '../../modules/assessment-runtime/canonical'
import { educationCompositionKey } from '../../modules/education-tools/private-tool.composition-contracts'
import {
  readSealedCompositionContent,
  resetSealedCompositionContentCacheForTests,
  sealedCompositionContentCacheStats,
} from '../../modules/education-tools/private-tool.composition-content'

const sha = 'b'.repeat(64)
const origin = {
  schemaVersion: 1 as const,
  adapterVersion: '1.0.0' as const,
  mode: 'COMPOSITION' as const,
  entry: 'SCHOOL' as const,
  organizationId: '00000000-0000-4000-8000-000000000001',
  ownerUserId: '00000000-0000-4000-8000-000000000002',
  toolId: '00000000-0000-4000-8000-000000000004',
  versionId: '00000000-0000-4000-8000-000000000003',
  contentHash: sha,
  variantKey: 'STUDENT:SELF' as const,
}
const manifestHash = 'c'.repeat(64)
const unit = {
  itemId: '00000000-0000-4000-8000-000000000010',
  family: 'SCALE' as const,
  source: { kind: 'SCALE' as const, id: 'scale-1' },
  measurement: { releaseId: '00000000-0000-4000-8000-000000000020', contentHash: sha, measurementHash: sha },
}

const sqlText = (query: any): string => (
  Array.isArray(query?.strings) ? query.strings.join('?') : String(query?.sql ?? query)
)

describe('readSealedCompositionContent bounded process cache', () => {
  beforeEach(() => {
    resetSealedCompositionContentCacheForTests()
  })

  it('caches immutable sealed units across transactions while still checking live PUBLISHED headers', async () => {
    let published = true
    const fullCalls: number[] = []
    const makeTx = () => ({
      $queryRaw: vi.fn(async (query: any) => {
        if (!published) return []
        const text = sqlText(query)
        const header = {
          creationKey: educationCompositionKey(origin),
          creationHash: canonicalHash(origin),
          manifestHash,
        }
        if (text.includes("training_content_snapshot->'units'")) {
          fullCalls.push(1)
          return [{ ...header, origin, units: [unit] }]
        }
        return [header]
      }),
    })

    const tx1 = makeTx()
    const first = await readSealedCompositionContent(tx1 as never, {
      compositeId: 'comp-1',
      ownerId: origin.ownerUserId,
      anchor: { origin, manifestHash },
    })
    expect(first.units.get(unit.itemId)).toEqual(unit)
    expect(fullCalls).toHaveLength(1)

    const tx2 = makeTx()
    const second = await readSealedCompositionContent(tx2 as never, {
      compositeId: 'comp-1',
      ownerId: origin.ownerUserId,
      anchor: { origin, manifestHash },
    })
    expect(second.units.get(unit.itemId)).toEqual(unit)
    expect(fullCalls).toHaveLength(1)
    expect(tx2.$queryRaw).toHaveBeenCalledTimes(1)
    expect(sealedCompositionContentCacheStats().hits).toBe(1)

    published = false
    const tx3 = makeTx()
    await expect(readSealedCompositionContent(tx3 as never, {
      compositeId: 'comp-1',
      ownerId: origin.ownerUserId,
    })).rejects.toMatchObject({ code: 'PRIVATE_COMPOSITION_IDENTITY_INVALID' })
  })
})
