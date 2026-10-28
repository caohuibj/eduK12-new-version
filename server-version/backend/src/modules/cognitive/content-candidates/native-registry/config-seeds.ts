import { MOT_IDENTITY, motConfig } from '../mot/protocol'
import { ENUMERATION_RECIPE_IDENTITY, enumerationRecipeConfig } from '../enumeration/protocol'
import type { CognitiveSeed } from '../../task-seed.types'

/** One base configuration plus the exact native task's two profile patches, never two duplicate version rows. */
export function nativeMotConfigSeed() {
  return { testType: MOT_IDENTITY.testType, configVersion: MOT_IDENTITY.configVersion,
    name: '多目标追踪', engineVersion: MOT_IDENTITY.engineVersion, scoringVersion: MOT_IDENTITY.scoringVersion,
    config: motConfig('experience'), status: 'DRAFT' as const }
}
export function nativeEnumerationConfigSeed() {
  return { testType: ENUMERATION_RECIPE_IDENTITY.testType, configVersion: ENUMERATION_RECIPE_IDENTITY.configVersion,
    name: '短时点数判断', engineVersion: ENUMERATION_RECIPE_IDENTITY.engineVersion, scoringVersion: ENUMERATION_RECIPE_IDENTITY.scoringVersion,
    config: enumerationRecipeConfig('experience'), status: 'DRAFT' as const }
}

/** Exact existing native configs shared by selected installation and Prisma seeding. */
export const nativeCognitiveConfigSeeds: readonly CognitiveSeed[] = [nativeMotConfigSeed(), nativeEnumerationConfigSeed()]
