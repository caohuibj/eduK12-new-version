import { describe, expect, it, vi } from 'vitest'
import { seedCognitiveConfigs, COGNITIVE_SEEDS } from '../../../prisma/seeds/cognitive'

const first = COGNITIVE_SEEDS[0]

describe('Cognitive seed lifecycle compatibility', () => {
  it.each(['DRAFT', 'PUBLISHED', 'RETIRED'] as const)(
    'preserves an existing %s lifecycle state when immutable seed content still matches',
    async (status) => {
      const prisma = {
        cognitiveTestConfig: {
          findUnique: vi.fn(async ({ where }: any) => {
            const key = where.testType_configVersion
            const seed = COGNITIVE_SEEDS.find(
              (candidate) => candidate.testType === key.testType && candidate.configVersion === key.configVersion,
            )
            if (!seed) return null
            return {
              id: `${seed.testType}/${seed.configVersion}`,
              ...seed,
              status,
            }
          }),
          create: vi.fn(),
        },
      }

      await seedCognitiveConfigs(prisma as never)

      expect(prisma.cognitiveTestConfig.create).not.toHaveBeenCalled()
    },
  )

  it('fails closed when immutable seed content diverges even if lifecycle is valid', async () => {
    const prisma = {
      cognitiveTestConfig: {
        findUnique: vi.fn(async ({ where }: any) => {
          const key = where.testType_configVersion
          const seed = COGNITIVE_SEEDS.find(
            (candidate) => candidate.testType === key.testType && candidate.configVersion === key.configVersion,
          )
          if (!seed) return null
          return {
            id: `${seed.testType}/${seed.configVersion}`,
            ...seed,
            name: seed === first ? `${seed.name} changed` : seed.name,
            status: 'PUBLISHED',
          }
        }),
        create: vi.fn(),
      },
    }

    await expect(seedCognitiveConfigs(prisma as never)).rejects.toThrow(/divergent core content/)
    expect(prisma.cognitiveTestConfig.create).not.toHaveBeenCalled()
  })
})
