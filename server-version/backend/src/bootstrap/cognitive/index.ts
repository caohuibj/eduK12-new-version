import type { PrismaClient } from '@prisma/client'
import { seedFakeCognitiveConfig } from './fake.bootstrap'
import { seedMemoryCognitiveConfig } from './memory.bootstrap'
import { seedReactionCognitiveConfig } from './reaction.bootstrap'
import { seedStroopCognitiveConfig } from './stroop.bootstrap'

export const seedCognitiveConfigs = async (prisma: PrismaClient): Promise<void> => {
  await seedFakeCognitiveConfig(prisma)
  await seedReactionCognitiveConfig(prisma)
  await seedMemoryCognitiveConfig(prisma)
  await seedStroopCognitiveConfig(prisma)
}
