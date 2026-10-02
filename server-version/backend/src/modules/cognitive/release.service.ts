import { assertCognitiveProductEligible } from './product-eligibility'
import { prisma } from '../../config/database'
import { assertConfigStatusTransition } from './config-immutability'
import { BAD_REQUEST, CONFLICT, NOT_FOUND } from './cognitive.errors'
import { evaluateCognitiveProductReadiness } from './library/product-readiness'
import { getCognitiveV2TaskDefinition } from './v2/registry'

const lifecycleSelect = {
  id: true,
  testType: true,
  configVersion: true,
  name: true,
  engineVersion: true,
  scoringVersion: true,
  status: true,
  accessPolicy: true,
  publishedAt: true,
  updatedAt: true,
} as const

const readinessBlockerMessage = (blockers: Array<{ stage: string; code: string; message: string }>): string =>
  blockers.map((blocker) => `${blocker.stage}/${blocker.code}: ${blocker.message}`).join('; ')

/**
 * Explicitly publish one exact CognitiveTestConfig.
 *
 * CognitiveTestConfig.status is the only product lifecycle truth. Registry
 * existence and Product Readiness are prerequisites for this transition, never
 * substitutes for it and never auto-publish a DRAFT row.
 */
export const publishCognitiveConfig = async (configId: string) => {
  const config = await prisma.cognitiveTestConfig.findUnique({ where: { id: configId } })
  if (!config) throw NOT_FOUND('CognitiveTestConfig not found')
  assertCognitiveProductEligible(config.testType)

  try {
    assertConfigStatusTransition(config.status, 'PUBLISHED')
  } catch (error) {
    throw BAD_REQUEST(error instanceof Error ? error.message : 'Cognitive config cannot be published from its current status')
  }

  const definition = getCognitiveV2TaskDefinition(
    config.testType,
    config.engineVersion,
    config.scoringVersion,
  )
  if (!definition) {
    throw BAD_REQUEST(
      `No Cognitive v2 implementation for ${config.testType}/${config.engineVersion}/${config.scoringVersion}`,
    )
  }

  const readiness = evaluateCognitiveProductReadiness(definition, config.config)
  if (!readiness.ready) {
    throw BAD_REQUEST(`Cognitive product readiness failed: ${readinessBlockerMessage(readiness.blockers)}`)
  }

  // Snapshot-safe CAS: if any DRAFT core/operational update lands after the
  // readiness read, updatedAt changes and this transition fails closed instead
  // of publishing a row that was not actually validated.
  const publishedAt = new Date()
  const result = await prisma.cognitiveTestConfig.updateMany({
    where: {
      id: config.id,
      status: 'DRAFT',
      updatedAt: config.updatedAt,
    },
    data: {
      status: 'PUBLISHED',
      publishedAt,
    },
  })
  if (result.count !== 1) {
    throw CONFLICT('CognitiveTestConfig changed while publishing; reload, re-run readiness, and retry')
  }

  const published = await prisma.cognitiveTestConfig.findUnique({
    where: { id: config.id },
    select: lifecycleSelect,
  })
  if (!published) throw NOT_FOUND('CognitiveTestConfig not found after publish')
  return published
}

/** Explicitly retire a published Cognitive config without changing history. */
export const retireCognitiveConfig = async (configId: string) => {
  const config = await prisma.cognitiveTestConfig.findUnique({ where: { id: configId } })
  if (!config) throw NOT_FOUND('CognitiveTestConfig not found')

  try {
    assertConfigStatusTransition(config.status, 'RETIRED')
  } catch (error) {
    throw BAD_REQUEST(error instanceof Error ? error.message : 'Cognitive config cannot be retired from its current status')
  }

  const result = await prisma.cognitiveTestConfig.updateMany({
    where: { id: config.id, status: 'PUBLISHED', updatedAt: config.updatedAt },
    data: { status: 'RETIRED' },
  })
  if (result.count !== 1) {
    throw CONFLICT('CognitiveTestConfig changed while retiring; reload and retry')
  }

  const retired = await prisma.cognitiveTestConfig.findUnique({
    where: { id: config.id },
    select: lifecycleSelect,
  })
  if (!retired) throw NOT_FOUND('CognitiveTestConfig not found after retire')
  return retired
}
