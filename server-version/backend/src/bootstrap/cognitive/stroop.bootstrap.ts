import type { PrismaClient } from '@prisma/client'
import type { CognitiveConfigSeedDefinition } from './config.bootstrap'
import { ensurePublishedCognitiveConfig } from './config.bootstrap'

const STROOP_CONFIG: CognitiveConfigSeedDefinition = {
  testType: 'stroop',
  configVersion: '1.0.1',
  name: 'Color-Word Stroop v1.0.1 [INTERNAL PILOT]',
  status: 'PUBLISHED',
  engineVersion: '1.0.0',
  scoringVersion: '1.0.0',
  config: {
    totalTrials: 24,
    congruentRatio: 0.5,
    fixationMs: 500,
    stimulusDurationMs: 2000,
    isiMs: 500,
    validRtFloorMs: 200,
    report: {
      reportVersion: '1.0.0',
      referenceMode: 'simulated',
      referenceVersion: 'sim-k12-v0.1',
      referenceBand: 'K7-9',
    },
  },
}

export const seedStroopCognitiveConfig = (prisma: PrismaClient) =>
  ensurePublishedCognitiveConfig(prisma, STROOP_CONFIG)
