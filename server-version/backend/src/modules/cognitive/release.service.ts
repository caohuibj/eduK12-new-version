import { Prisma } from '@prisma/client'
import { cognitiveMeasurementRelease } from '../measurement-content/cognitive'
import { publishContentRelease, transitionContentRelease } from '../measurement-content/repository'
import { assertCognitiveProductEligible } from './product-eligibility'
import { prisma } from '../../config/database'
import { assertConfigStatusTransition } from './config-immutability'
import { BAD_REQUEST, CONFLICT, NOT_FOUND } from './cognitive.errors'
import { evaluateCognitiveProductReadiness } from './library/product-readiness'
import { requireCognitiveTaskResource, assertResourceConfigVersion, assertNativeDeliverySupported } from './task-resource'
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
export const publishCognitiveConfig = async (configId: string, actorUserId?: string) => {
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

  const resource = requireCognitiveTaskResource(config.testType, config.engineVersion, config.scoringVersion)
  assertResourceConfigVersion(resource, config.configVersion)
  assertNativeDeliverySupported(resource, 'authenticated')
  const readiness = evaluateCognitiveProductReadiness(definition, config.config)
  if (!readiness.ready) {
    throw BAD_REQUEST(`Cognitive product readiness failed: ${readinessBlockerMessage(readiness.blockers)}`)
  }

  // Authenticated actor provenance is required even for the administrative CLI.
  // V05 maps this existing system-admin check to the final content capability.
  if (!actorUserId) throw BAD_REQUEST('A verified publication actor is required')
  const release = await prisma.$transaction(async tx => {
    const actor = await tx.user.findUnique({ where: { id: actorUserId } })
    if (!actor || actor.platformRole !== 'SYSTEM_ADMIN' || !actor.isActive || actor.isFrozen
      || (actor.expiresAt && actor.expiresAt <= new Date())) throw BAD_REQUEST('Active system administrator required')
    const result = await tx.cognitiveTestConfig.updateMany({
      where: { id: config.id, status: 'DRAFT', updatedAt: config.updatedAt },
      data: { status: 'PUBLISHED', publishedAt: new Date() },
    })
    if (result.count !== 1) throw CONFLICT('CognitiveTestConfig changed while publishing; reload and retry')
    const content = await publishContentRelease(tx, cognitiveMeasurementRelease({
      localId: config.testType, version: config.configVersion, testType: config.testType,
      configVersion: config.configVersion, engineVersion: config.engineVersion, scoringVersion: config.scoringVersion,
      config: config.config, scope: { kind: 'PLATFORM' },
    }), actorUserId)
    await tx.$executeRaw(Prisma.sql`UPDATE cognitive_test_configs SET measurement_release_id=${content.releaseId} WHERE id=${config.id}`)
    return content
  })

  const published = await prisma.cognitiveTestConfig.findUnique({
    where: { id: config.id },
    select: lifecycleSelect,
  })
  if (!published) throw NOT_FOUND('CognitiveTestConfig not found after publish')
  return { ...published, measurementReleaseId: release.releaseId }
}

/** Explicitly retire a published Cognitive config without changing history. */
export const retireCognitiveConfig = async (configId: string, actorUserId?: string) => {
  const config = await prisma.cognitiveTestConfig.findUnique({ where: { id: configId } })
  if (!config) throw NOT_FOUND('CognitiveTestConfig not found')

  try {
    assertConfigStatusTransition(config.status, 'RETIRED')
  } catch (error) {
    throw BAD_REQUEST(error instanceof Error ? error.message : 'Cognitive config cannot be retired from its current status')
  }

  if (!actorUserId) throw BAD_REQUEST('A verified lifecycle actor is required')
  await prisma.$transaction(async tx => {
    const actor = await tx.user.findUnique({ where: { id: actorUserId } })
    if (!actor || actor.platformRole !== 'SYSTEM_ADMIN' || !actor.isActive || actor.isFrozen
      || (actor.expiresAt && actor.expiresAt <= new Date())) throw BAD_REQUEST('Active system administrator required')
    const result = await tx.cognitiveTestConfig.updateMany({
      where: { id: config.id, status: 'PUBLISHED', updatedAt: config.updatedAt }, data: { status: 'RETIRED' },
    })
    if (result.count !== 1) throw CONFLICT('CognitiveTestConfig changed while retiring; reload and retry')
    const refs = await tx.$queryRaw<Array<{measurement_release_id:string|null}>>(Prisma.sql`SELECT measurement_release_id FROM cognitive_test_configs WHERE id=${config.id}`)
    if (refs[0]?.measurement_release_id) await transitionContentRelease(tx, { releaseId: refs[0].measurement_release_id,
      expectedStatus: 'PUBLISHED', status: 'RETIRED', actorId: actorUserId, reason: 'Cognitive configuration retired' })
  })

  const retired = await prisma.cognitiveTestConfig.findUnique({
    where: { id: config.id },
    select: lifecycleSelect,
  })
  if (!retired) throw NOT_FOUND('CognitiveTestConfig not found after retire')
  return retired
}
