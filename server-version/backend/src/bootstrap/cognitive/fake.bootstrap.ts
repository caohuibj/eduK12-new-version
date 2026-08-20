import type { PrismaClient } from '@prisma/client'
import type { CognitiveConfigSeedDefinition } from './config.bootstrap'
import { ensurePublishedCognitiveConfig } from './config.bootstrap'

const FAKE_CONFIG: CognitiveConfigSeedDefinition = {
  testType: 'fake',
  configVersion: '1.0.0',
  name: 'Fake Cognitive Test v1.0.0',
  status: 'PUBLISHED',
  engineVersion: '1.0.0',
  scoringVersion: '1.0.0',
  config: {
    trialCount: 3,
    trialDurationMs: 1000,
    allowPractice: false,
    maxRtMs: 60000,
  },
}

export const seedFakeCognitiveConfig = (prisma: PrismaClient) =>
  ensurePublishedCognitiveConfig(prisma, FAKE_CONFIG)
