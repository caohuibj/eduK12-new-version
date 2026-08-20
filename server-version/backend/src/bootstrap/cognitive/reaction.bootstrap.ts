import type { PrismaClient } from '@prisma/client'
import type { CognitiveConfigSeedDefinition } from './config.bootstrap'
import { ensurePublishedCognitiveConfig } from './config.bootstrap'

const REACTION_CONFIG: CognitiveConfigSeedDefinition = {
  testType: 'reaction',
  configVersion: '1.0.1',
  name: 'Reaction Time v1.0.1 [INTERNAL PILOT]',
  status: 'PUBLISHED',
  engineVersion: '1.0.0',
  scoringVersion: '1.0.0',
  config: {
    totalTrials: 20,
    foreperiodMinMs: 700,
    foreperiodMaxMs: 1500,
    timeoutMs: 2000,
    readyDurationMs: 1000,
    report: {
      reportVersion: '1.0.0',
      referenceMode: 'simulated',
      referenceVersion: 'sim-k12-v0.1',
      referenceBand: 'K7-9',
    },
  },
}

export const seedReactionCognitiveConfig = (prisma: PrismaClient) =>
  ensurePublishedCognitiveConfig(prisma, REACTION_CONFIG)
