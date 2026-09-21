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

  const result = await prisma.cognitiveTestConfig.updateMany({
    where: { id: config.id, status: 'DRAFT' },
    data: { status: 'PUBLISHED' },
  })
  if (result.count !== 1) {
    throw CONFLICT('CognitiveTestConfig status changed while publishing; reload and retry')
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
    where: { id: config.id, status: 'PUBLISHED' },
    data: { status: 'RETIRED' },
  })
  if (result.count !== 1) {
    throw CONFLICT('CognitiveTestConfig status changed while retiring; reload and retry')
  }

  const retired = await prisma.cognitiveTestConfig.findUnique({
    where: { id: config.id },
    select: lifecycleSelect,
  })
  if (!retired) throw NOT_FOUND('CognitiveTestConfig not found after retire')
  return retired
}
