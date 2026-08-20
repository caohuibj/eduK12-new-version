import type { Prisma, PrismaClient } from '@prisma/client'
import { validateCognitiveConfig } from '../../modules/cognitive/config/config-validator'

export interface CognitiveConfigSeedDefinition {
  testType: string
  configVersion: string
  name: string
  status: 'PUBLISHED'
  engineVersion: string
  scoringVersion: string
  config: Prisma.InputJsonValue
}

const deepEqual = (a: unknown, b: unknown): boolean => {
  if (a === b) return true
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return a === b
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false
    return a.every((value, index) => deepEqual(value, (b as unknown[])[index]))
  }
  const left = a as Record<string, unknown>
  const right = b as Record<string, unknown>
  const leftKeys = Object.keys(left)
  const rightKeys = Object.keys(right)
  return leftKeys.length === rightKeys.length && leftKeys.every((key) => deepEqual(left[key], right[key]))
}

export const ensurePublishedCognitiveConfig = async (
  prisma: PrismaClient,
  expected: CognitiveConfigSeedDefinition
): Promise<void> => {
  try {
    validateCognitiveConfig(
      {
        testType: expected.testType,
        engineVersion: expected.engineVersion,
        scoringVersion: expected.scoringVersion,
      },
      expected.config
    )
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'schema validation failed'
    throw new Error(`Cannot seed cognitive config ${expected.testType}/${expected.configVersion}: ${reason}`)
  }

  const existing = await prisma.cognitiveTestConfig.findUnique({
    where: { testType_configVersion: { testType: expected.testType, configVersion: expected.configVersion } },
  })

  if (!existing) {
    const created = await prisma.cognitiveTestConfig.create({ data: expected })
    console.log(`Cognitive config created: testType=${created.testType} configVersion=${created.configVersion} status=${created.status}`)
    return
  }

  const same =
    existing.name === expected.name &&
    existing.status === expected.status &&
    existing.engineVersion === expected.engineVersion &&
    existing.scoringVersion === expected.scoringVersion &&
    deepEqual(existing.config, expected.config)

  if (same) {
    console.log(`Cognitive config already exists and is unchanged: testType=${existing.testType} configVersion=${existing.configVersion} status=${existing.status}`)
    return
  }

  throw new Error(`cognitiveTestConfig ${expected.testType}/${expected.configVersion} already exists with divergent content; create a new configVersion instead of mutating a published config`)
}
