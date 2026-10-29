import { Prisma, type PrismaClient } from '@prisma/client'
import { canonicalHash } from '../../src/modules/assessment-runtime/canonical'
import { nativeMotConfigSeed, nativeEnumerationConfigSeed } from '../../src/modules/cognitive/content-candidates/native-registry/config-seeds'
export { nativeMotConfigSeed, nativeEnumerationConfigSeed } from '../../src/modules/cognitive/content-candidates/native-registry/config-seeds'
/** Explicit registration only. Never publish, retire, mutate a version or create accounts/grants. */
async function seedNativeConfig(db: Pick<PrismaClient, 'cognitiveTestConfig'>,
  expected: ReturnType<typeof nativeMotConfigSeed> | ReturnType<typeof nativeEnumerationConfigSeed>) {
  const where = { testType_configVersion: { testType: expected.testType, configVersion: expected.configVersion } }
  const validate = (row: NonNullable<Awaited<ReturnType<typeof db.cognitiveTestConfig.findUnique>>>) => {
    if (row.name !== expected.name || row.engineVersion !== expected.engineVersion || row.scoringVersion !== expected.scoringVersion
      || canonicalHash(row.config) !== canonicalHash(expected.config))
      throw new Error(`Native Cognitive ${expected.testType}/${expected.configVersion} has divergent content; refusing to overwrite the frozen version`)
    return row
  }
  const existing = await db.cognitiveTestConfig.findUnique({ where })
  if (existing) return { config: validate(existing), created: false }
  try {
    const row = await db.cognitiveTestConfig.create({ data: { ...expected, config: expected.config as unknown as Prisma.InputJsonValue } })
    return { config: row, created: true }
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error
    const raced = await db.cognitiveTestConfig.findUnique({ where })
    if (!raced) throw error
    return { config: validate(raced), created: false }
  }
}

export const seedNativeMotConfig = (db: Pick<PrismaClient, 'cognitiveTestConfig'>) => seedNativeConfig(db, nativeMotConfigSeed())
export const seedNativeEnumerationConfig = (db: Pick<PrismaClient, 'cognitiveTestConfig'>) => seedNativeConfig(db, nativeEnumerationConfigSeed())
