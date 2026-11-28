import { Prisma, type CognitiveTestConfig } from '@prisma/client'
import { publishedCognitiveConfigMeasurement } from '../measurement-content/cognitive'
import { publishContentRelease, transitionContentRelease } from '../measurement-content/repository'
import { assertCognitiveProductEligible } from './product-eligibility'
import { assertGitScalePublisher } from '../scale/onboarding/git-release-actor'
import { cognitiveDeclaredReport } from './profile-freeze'
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

type CognitivePublishContext = {actorId:string;source:'ADMIN'|'SYSTEM_GIT_RELEASE'}

/** Shared product publication core. Both adapters pin one exact config and
 * use the same readiness, immutability and measurement publication checks. */
export async function publishCognitiveConfigRelease(
  tx: Prisma.TransactionClient,
  config: CognitiveTestConfig,
  context: CognitivePublishContext,
) {
  const { actorId, source } = context
  if (source === 'SYSTEM_GIT_RELEASE') {
    await assertGitScalePublisher(tx, actorId)
  } else {
    const actor = await tx.user.findUnique({ where: { id: actorId } })
    if (!actor || actor.platformRole !== 'SYSTEM_ADMIN' || !actor.isActive || actor.isFrozen
      || (actor.expiresAt && actor.expiresAt <= new Date())) throw BAD_REQUEST('Active system administrator required')
  }
  assertCognitiveProductEligible(config.testType)
  try {
    assertConfigStatusTransition(config.status, 'PUBLISHED')
  } catch (error) {
    throw BAD_REQUEST(error instanceof Error ? error.message : 'Cognitive config cannot be published from its current status')
  }
  const definition = getCognitiveV2TaskDefinition(config.testType, config.engineVersion, config.scoringVersion)
  if (!definition) throw BAD_REQUEST(
    `No Cognitive v2 implementation for ${config.testType}/${config.engineVersion}/${config.scoringVersion}`,
  )
  const readiness = evaluateCognitiveProductReadiness(definition, config.config)
  if (!readiness.ready) {
    throw BAD_REQUEST(`Cognitive product readiness failed: ${readinessBlockerMessage(readiness.blockers)}`)
  }
  const result = await tx.cognitiveTestConfig.updateMany({
    where: { id: config.id, status: 'DRAFT', updatedAt: config.updatedAt },
    data: { status: 'PUBLISHED', publishedAt: new Date() },
  })
  if (result.count !== 1) throw CONFLICT('CognitiveTestConfig changed while publishing; reload and retry')
  const release = await publishContentRelease(tx, publishedCognitiveConfigMeasurement(config), actorId)
  if (release.status !== 'PUBLISHED' || release.layer !== 'MEASUREMENT') throw CONFLICT('Cognitive measurement release is unavailable')
  await tx.$executeRaw(Prisma.sql`UPDATE cognitive_test_configs SET measurement_release_id=${release.releaseId} WHERE id=${config.id}`)
  const published = await tx.cognitiveTestConfig.findUnique({ where: { id: config.id }, select: lifecycleSelect })
  if (!published) throw NOT_FOUND('CognitiveTestConfig not found after publish')
  return { ...published, measurementReleaseId: release.releaseId }
}

export const publishCognitiveConfig = async (configId: string, actorUserId?: string) => {
  const config = await prisma.cognitiveTestConfig.findUnique({ where: { id: configId } })
  if (!config) throw NOT_FOUND('CognitiveTestConfig not found')
  assertCognitiveProductEligible(config.testType)
  if (!actorUserId) throw BAD_REQUEST('A verified publication actor is required')
  return prisma.$transaction(tx => publishCognitiveConfigRelease(tx, config, {actorId:actorUserId,source:'ADMIN'}))
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
    // Several immutable Git R versions may share the same stored native
    // measurement. Retiring a display version is not a request to retire P.
    if (refs[0]?.measurement_release_id&&!cognitiveDeclaredReport(config.config)) await transitionContentRelease(tx, { releaseId: refs[0].measurement_release_id,
      expectedStatus: 'PUBLISHED', status: 'RETIRED', actorId: actorUserId, reason: 'Cognitive configuration retired' })
  })

  const retired = await prisma.cognitiveTestConfig.findUnique({
    where: { id: config.id },
    select: lifecycleSelect,
  })
  if (!retired) throw NOT_FOUND('CognitiveTestConfig not found after retire')
  return retired
}
