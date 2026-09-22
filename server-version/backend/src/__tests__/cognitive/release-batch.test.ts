import { describe, expect, it, vi } from 'vitest'
import releaseInput from '../../../releases/cognitive-round2-pilot-2026-09-22.json'
import {
  applyCognitiveConfigBatchPublication,
  cognitiveBatchPublicationInputSchema,
  planCognitiveConfigBatchPublication,
} from '../../modules/cognitive/release-batch'
import { COGNITIVE_SEEDS } from '../../../prisma/seeds/cognitive'

const input = cognitiveBatchPublicationInputSchema.parse(releaseInput)

const rowFor = (selector: { testType: string; configVersion: string }) => {
  const seed = COGNITIVE_SEEDS.find(
    (candidate) => candidate.testType === selector.testType && candidate.configVersion === selector.configVersion,
  )
  if (!seed) return null
  return {
    id: `${seed.testType}/${seed.configVersion}`,
    ...seed,
    status: 'DRAFT' as const,
  }
}

describe('Cognitive batch publication', () => {
  it('pins the 15 Round 2 exact release identities including BART 1.1.0', () => {
    expect(input.configs).toHaveLength(15)
    expect(new Set(input.configs.map((entry) => entry.testType)).size).toBe(15)
    expect(input.configs.find((entry) => entry.testType === 'bart')).toEqual({
      testType: 'bart',
      configVersion: '1.1.0',
      engineVersion: '1.0.0',
      scoringVersion: '1.1.0',
    })
  })

  it('preflights every exact DRAFT config through the existing Product Readiness gate', async () => {
    const db = {
      cognitiveTestConfig: {
        findUnique: vi.fn(async ({ where }: any) => rowFor(where.testType_configVersion)),
      },
    }
    const plan = await planCognitiveConfigBatchPublication(db, input)
    expect(plan.allowPublish).toBe(true)
    expect(plan.entries.every((entry) => entry.action === 'PUBLISH')).toBe(true)
  })

  it('is rerun-safe for already-published exact configs', async () => {
    const db = {
      cognitiveTestConfig: {
        findUnique: vi.fn(async ({ where }: any) => {
          const row = rowFor(where.testType_configVersion)
          return row ? { ...row, status: 'PUBLISHED' as const } : null
        }),
      },
    }
    const publishOne = vi.fn()
    const result = await applyCognitiveConfigBatchPublication(db, input, publishOne)
    expect(publishOne).not.toHaveBeenCalled()
    expect(result.results.every((entry) => entry.action === 'NOOP_ALREADY_PUBLISHED')).toBe(true)
  })

  it('fails the whole preflight before mutation when an exact identity drifts', async () => {
    const db = {
      cognitiveTestConfig: {
        findUnique: vi.fn(async ({ where }: any) => {
          const row = rowFor(where.testType_configVersion)
          return row?.testType === 'matrix' ? { ...row, scoringVersion: '9.9.9' } : row
        }),
      },
    }
    const publishOne = vi.fn()
    await expect(applyCognitiveConfigBatchPublication(db, input, publishOne)).rejects.toThrow(/blocked by preflight/)
    expect(publishOne).not.toHaveBeenCalled()
  })
})
