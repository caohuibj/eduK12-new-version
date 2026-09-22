import { z } from 'zod'
import { evaluateCognitiveProductReadiness } from './library/product-readiness'
import { getCognitiveV2TaskDefinition } from './v2/registry'

export const cognitiveBatchPublicationInputSchema = z.object({
  schemaVersion: z.literal(1),
  releaseId: z.string().min(1),
  configs: z.array(z.object({
    testType: z.string().min(1),
    configVersion: z.string().min(1),
    engineVersion: z.string().min(1),
    scoringVersion: z.string().min(1),
  }).strict()).min(1),
}).strict()

export type CognitiveBatchPublicationInput = z.infer<typeof cognitiveBatchPublicationInputSchema>

type ConfigRow = {
  id: string
  testType: string
  configVersion: string
  engineVersion: string
  scoringVersion: string
  status: 'DRAFT' | 'PUBLISHED' | 'RETIRED'
  config: unknown
}

export type CognitiveBatchPublicationEntry = {
  testType: string
  configVersion: string
  engineVersion: string
  scoringVersion: string
  configId?: string
  status?: ConfigRow['status']
  action: 'PUBLISH' | 'NOOP_ALREADY_PUBLISHED' | 'BLOCKED'
  blockers: string[]
}

export type CognitiveBatchPublicationPlan = {
  schemaVersion: 1
  releaseId: string
  allowPublish: boolean
  entries: CognitiveBatchPublicationEntry[]
}

export type CognitiveBatchPublicationDb = {
  cognitiveTestConfig: {
    findUnique(args: {
      where: { testType_configVersion: { testType: string; configVersion: string } }
    }): Promise<ConfigRow | null>
  }
}

export const planCognitiveConfigBatchPublication = async (
  db: CognitiveBatchPublicationDb,
  rawInput: CognitiveBatchPublicationInput,
): Promise<CognitiveBatchPublicationPlan> => {
  const input = cognitiveBatchPublicationInputSchema.parse(rawInput)
  const seen = new Set<string>()
  const entries: CognitiveBatchPublicationEntry[] = []

  for (const expected of input.configs) {
    const selector = `${expected.testType}/${expected.configVersion}`
    const duplicate = seen.has(selector)
    seen.add(selector)
    const blockers: string[] = duplicate ? ['DUPLICATE_CONFIG_SELECTOR'] : []

    const config = await db.cognitiveTestConfig.findUnique({
      where: { testType_configVersion: { testType: expected.testType, configVersion: expected.configVersion } },
    })
    if (!config) {
      entries.push({ ...expected, action: 'BLOCKED', blockers: [...blockers, 'CONFIG_NOT_FOUND'] })
      continue
    }

    if (config.engineVersion !== expected.engineVersion) blockers.push('ENGINE_VERSION_MISMATCH')
    if (config.scoringVersion !== expected.scoringVersion) blockers.push('SCORING_VERSION_MISMATCH')
    if (config.status === 'RETIRED') blockers.push('CONFIG_RETIRED')

    if (blockers.length === 0 && config.status === 'DRAFT') {
      const definition = getCognitiveV2TaskDefinition(
        config.testType,
        config.engineVersion,
        config.scoringVersion,
      )
      if (!definition) blockers.push('EXECUTION_IDENTITY_NOT_FOUND')
      else {
        const readiness = evaluateCognitiveProductReadiness(definition, config.config)
        blockers.push(...readiness.blockers.map((blocker) => `${blocker.stage}/${blocker.code}`))
      }
    }

    entries.push({
      ...expected,
      configId: config.id,
      status: config.status,
      action: blockers.length
        ? 'BLOCKED'
        : config.status === 'PUBLISHED'
          ? 'NOOP_ALREADY_PUBLISHED'
          : 'PUBLISH',
      blockers,
    })
  }

  return {
    schemaVersion: 1,
    releaseId: input.releaseId,
    allowPublish: entries.every((entry) => entry.action !== 'BLOCKED'),
    entries,
  }
}

export const applyCognitiveConfigBatchPublication = async (
  db: CognitiveBatchPublicationDb,
  rawInput: CognitiveBatchPublicationInput,
  publishOne: (configId: string) => Promise<unknown>,
) => {
  const plan = await planCognitiveConfigBatchPublication(db, rawInput)
  if (!plan.allowPublish) throw new Error('Cognitive batch publication blocked by preflight')

  const results: Array<{
    testType: string
    configVersion: string
    action: 'PUBLISHED' | 'NOOP_ALREADY_PUBLISHED'
    result?: unknown
  }> = []

  for (const entry of plan.entries) {
    if (entry.action === 'NOOP_ALREADY_PUBLISHED') {
      results.push({ testType: entry.testType, configVersion: entry.configVersion, action: 'NOOP_ALREADY_PUBLISHED' })
      continue
    }
    if (!entry.configId) throw new Error(`Missing config id for ${entry.testType}/${entry.configVersion}`)
    results.push({
      testType: entry.testType,
      configVersion: entry.configVersion,
      action: 'PUBLISHED',
      result: await publishOne(entry.configId),
    })
  }

  return { schemaVersion: 1 as const, releaseId: plan.releaseId, results }
}
