import { Prisma, PrismaClient } from '@prisma/client'
import type { CognitiveSeed } from '../../src/modules/cognitive/task-seed.types'
import { cognitiveSeeds } from '../../src/modules/cognitive/generated/seeds'

export const COGNITIVE_SEEDS: CognitiveSeed[] = cognitiveSeeds

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return a === b
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false
    return a.every((value, index) => deepEqual(value, b[index]))
  }
  const left = a as Record<string, unknown>
  const right = b as Record<string, unknown>
  const leftKeys = Object.keys(left)
  const rightKeys = Object.keys(right)
  return leftKeys.length === rightKeys.length && leftKeys.every((key) => deepEqual(left[key], right[key]))
}

async function seedOneCognitiveConfig(prisma: PrismaClient, expected: CognitiveSeed): Promise<void> {
  const existing = await prisma.cognitiveTestConfig.findUnique({
    where: { testType_configVersion: { testType: expected.testType, configVersion: expected.configVersion } },
  })

  if (!existing) {
    await prisma.cognitiveTestConfig.create({
      data: {
        testType: expected.testType,
        configVersion: expected.configVersion,
        name: expected.name,
        status: expected.status,
        engineVersion: expected.engineVersion,
        scoringVersion: expected.scoringVersion,
        config: expected.config as Prisma.InputJsonValue,
      },
    })
    console.log(`${expected.testType} Cognitive 配置已创建: configVersion=${expected.configVersion} status=${expected.status}`)
    return
  }

  const sameCore =
    existing.name === expected.name &&
    existing.engineVersion === expected.engineVersion &&
    existing.scoringVersion === expected.scoringVersion &&
    deepEqual(existing.config, expected.config)
  if (sameCore) {
    console.log(
      `${expected.testType} Cognitive 配置核心内容一致，保留现有 lifecycle=${existing.status}（seed initial=${expected.status}）: configVersion=${expected.configVersion}`,
    )
    return
  }

  throw new Error(`cognitiveTestConfig ${expected.testType}/${expected.configVersion} already exists with divergent core content; create a new configVersion instead of mutating it`)
}

export async function seedCognitiveConfigs(prisma: PrismaClient): Promise<void> {
  for (const expected of COGNITIVE_SEEDS) {
    await seedOneCognitiveConfig(prisma, expected)
  }
}
