import type { PrismaClient } from '@prisma/client'
import type { CognitiveConfigSeedDefinition } from './config.bootstrap'
import { ensurePublishedCognitiveConfig } from './config.bootstrap'

const MEMORY_CONFIG: CognitiveConfigSeedDefinition = {
  testType: 'memory',
  configVersion: '1.0.1',
  name: 'Working Memory Span v1.0.1 [INTERNAL PILOT]',
  status: 'PUBLISHED',
  engineVersion: '1.0.0',
  scoringVersion: '1.0.0',
  config: {
    startLength: 2,
    maxLength: 11,
    trialsPerLevel: 2,
    digitDisplayMs: 800,
    digitIntervalMs: 200,
    readyDurationMs: 1000,
    inactivityGuardMs: 30000,
    report: {
      reportVersion: '1.0.0',
      referenceMode: 'simulated',
      referenceVersion: 'sim-k12-v0.1',
      referenceBand: 'K7-9',
    },
  },
}

export const seedMemoryCognitiveConfig = (prisma: PrismaClient) =>
  ensurePublishedCognitiveConfig(prisma, MEMORY_CONFIG)
