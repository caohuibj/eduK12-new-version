import type { Prisma, PrismaClient } from '../backend/node_modules/@prisma/client'
import type { RegistryEntry } from '../backend/src/modules/cognitive/cognitive.types'
import { seeds } from '../backend/src/modules/cognitive/tasks/fake/seeds'
import { requireIsolatedReleaseDatabase } from '../backend/src/__tests__/integration/integration-env'

/** Browser fixtures own their configuration; seed lifecycle remains untouched. */
export async function createCognitiveVideoFixtureConfig(
  db: Pick<PrismaClient, 'cognitiveTestConfig'>,
  entry: RegistryEntry<unknown, unknown>,
  suffix: string,
) {
  const selected = process.env.COGNITIVE_VIDEO_E2E_TEST_DATABASE_URL
  if (process.env.NODE_ENV !== 'test' || !selected) {
    throw new Error('Cognitive VIDEO fixture requires NODE_ENV=test and an explicit isolated test database')
  }
  requireIsolatedReleaseDatabase(selected)
  const seed = seeds.find(value => value.testType === entry.testType && value.engineVersion === entry.engineVersion && value.scoringVersion === entry.scoringVersion)
  if (!seed || entry.testType !== 'fake') throw new Error('Cognitive VIDEO fixture requires the exact fake task contract')
  return db.cognitiveTestConfig.create({ data: {
    testType: entry.testType,
    configVersion: `media7-fixture-${suffix}`,
    name: `MEDIA-7 isolated browser fixture ${suffix}`,
    engineVersion: entry.engineVersion,
    scoringVersion: entry.scoringVersion,
    config: entry.configSchema.parse(seed.config) as Prisma.InputJsonValue,
    status: 'PUBLISHED',
    publishedAt: new Date(),
    accessPolicy: 'OPEN',
  } })
}
